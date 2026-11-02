// SPDX-License-Identifier: GPL-3.0-or-later
package com.peteriley.solitairechess;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.view.WindowInsets;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;

public final class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net/";
    private static final String MODEL="nn-1a298aa575a0.nnue";
    private static final String MODEL_HASH="1a298aa575a085434d29027978dc36867fe9c5bcea9376654b7a8eba1e52dfc2";
    private final Handler main=new Handler(Looper.getMainLooper());
    private WebView web;
    private EngineSlot analysis,opponent;
    private boolean active=true,destroyed=false,modelReady=false;
    private long sequence=0,analysisToken=-1,playToken=-1;
    private int clientId=0,playRequest=-1,expected=5,completeDepth=0;
    private final TreeMap<Integer,TreeMap<Integer,JSONObject>> depths=new TreeMap<>();
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(247,247,242));
        root.setOnApplyWindowInsetsListener((view,insets)->{
            if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets padding=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());view.setPadding(padding.left,padding.top,padding.right,padding.bottom);}
            else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return android.os.Build.VERSION.SDK_INT>=30?WindowInsets.CONSUMED:insets.consumeSystemWindowInsets();
        });
        web=new WebView(this);web.setBackgroundColor(Color.rgb(247,247,242));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);settings.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Bridge(),"NativeChess");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().toString().startsWith(ORIGIN);}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();String path=uri.getPath();
                if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost())||path==null||path.contains("..")||path.contains("\\"))return blocked();
                try {
                    String file=path.equals("/")?"index.html":path.substring(1);
                    String mime=file.endsWith(".html")?"text/html":file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"application/octet-stream";
                    return new WebResourceResponse(mime,"UTF-8",200,"OK",Collections.singletonMap("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'"),getAssets().open("web/"+file));
                } catch(IOException e){return blocked();}
            }
            @Override public void onPageFinished(WebView view,String url){setWebActive(active);}
        });
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);root.requestApplyInsets();
        web.loadUrl(ORIGIN+"index.html");
    }
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    public final class Bridge {
        @JavascriptInterface public void postMessage(String json){if(json!=null&&json.length()<40000)main.post(()->handle(json));}
    }
    private void prepareEngines(){
        if(analysis!=null)return;
        Runnable prepare=this::prepareModel;
        analysis=new EngineSlot(getFilesDir().getAbsolutePath(),prepare,message->main.post(()->receive(message,false)));
        opponent=new EngineSlot(getFilesDir().getAbsolutePath(),prepare,message->main.post(()->receive(message,true)));
    }
    private synchronized void prepareModel(){
        if(modelReady)return;
        try {
            File destination=new File(getFilesDir(),MODEL);
            if(!destination.isFile()||!checksum(destination).equals(MODEL_HASH)){
                File partial=new File(getFilesDir(),MODEL+".part");
                try(InputStream input=getAssets().open(MODEL);OutputStream output=new FileOutputStream(partial)){byte[] buffer=new byte[131072];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);}
                if(!checksum(partial).equals(MODEL_HASH))throw new IOException("The bundled engine network failed verification.");
                if(!partial.renameTo(destination))throw new IOException("Unable to prepare the engine network.");
            }
            modelReady=true;
        } catch(Exception e){throw new IllegalStateException(e.getMessage(),e);}
    }
    private static String checksum(File file)throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[131072];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);}
        StringBuilder hex=new StringBuilder();for(byte value:digest.digest())hex.append(String.format(Locale.ROOT,"%02x",value&255));return hex.toString();
    }
    private boolean validFen(String fen){
        if(fen.length()>150||!fen.matches("[prnbqkPRNBQK1-8/]+ [wb] [-KQkq]+ [-a-h1-8]+ [0-9]+ [0-9]+"))return false;
        String board=fen.split(" ")[0];if(board.chars().filter(c->c=='K').count()!=1||board.chars().filter(c->c=='k').count()!=1)return false;
        String[] ranks=board.split("/");if(ranks.length!=8)return false;
        for(String rank:ranks){int count=0;for(char c:rank.toCharArray())count+=Character.isDigit(c)?c-'0':1;if(count!=8)return false;}return true;
    }
    private void handle(String json){
        if(destroyed||web==null||web.getUrl()==null||!web.getUrl().startsWith(ORIGIN))return;
        int request=-1;
        try {
            JSONObject body=new JSONObject(json);request=body.getInt("requestId");String method=body.getString("method");
            switch(method){
                case "metadata": reply(request,new JSONObject().put("name","Stockfish 19").put("eloMin",1320).put("eloMax",3190));return;
                case "showInfo":showInformation();reply(request,new JSONObject());return;
                case "stop":analysisToken=-1;if(analysis!=null)analysis.stop(++sequence);reply(request,new JSONObject());return;
                case "stopPlay":stopPlay();reply(request,new JSONObject());return;
                case "analyze":case "play":
                    if(!active){reply(request,new JSONObject().put("cancelled",true));return;}
                    JSONObject position=body.getJSONObject("position");String fen=position.getString("fen"),initial=position.getString("initialFen");
                    JSONArray history=position.getJSONArray("moves");if(!validFen(fen)||!validFen(initial)||history.length()>2000)throw new IllegalArgumentException("Invalid chess position.");
                    String[] moves=new String[history.length()];for(int i=0;i<moves.length;i++){moves[i]=history.getString(i);if(!moves[i].matches("[a-h][1-8][a-h][1-8][qrbn]?"))throw new IllegalArgumentException("Invalid move history.");}
                    prepareEngines();long token=++sequence;
                    if(method.equals("analyze")){
                        analysisToken=token;clientId=body.optInt("id");completeDepth=0;expected=5;depths.clear();
                        analysis.start(token,fen,initial,moves,5,0,1200);reply(request,new JSONObject().put("cancelled",false));
                    }else{
                        stopPlay();playToken=token;playRequest=request;
                        opponent.start(token,fen,initial,moves,1,Math.min(3190,Math.max(1320,body.optInt("elo",1600))),650);
                    }return;
                default:throw new IllegalArgumentException("Unsupported operation.");
            }
        }catch(Exception e){if(request>=0)reject(request,e.getMessage());}
    }
    private void receive(JSONObject message,boolean playing){
        if(destroyed)return;
        try {
            long token=message.getLong("token");String kind=message.getString("kind");
            if(playing){
                if(token!=playToken||playRequest<0)return;
                if(kind.equals("best")){int request=playRequest;playRequest=-1;reply(request,new JSONObject().put("bestmove",message.optString("bestmove")).put("cancelled",false));}
                if(kind.equals("error")){int request=playRequest;playRequest=-1;reject(request,message.optString("message","Engine unavailable."));}
            }else{
                if(token!=analysisToken)return;
                if(kind.equals("start"))expected=message.optInt("count",5);
                if(kind.equals("error")){emit(new JSONObject().put("id",clientId).put("status","Engine unavailable").put("error",message.optString("message")).put("lines",new JSONArray()));return;}
                if(kind.equals("info")){
                    int depth=message.getInt("depth"),rank=message.getInt("rank");
                    depths.computeIfAbsent(depth,k->new TreeMap<>()).put(rank,message);
                    TreeMap<Integer,JSONObject> batch=depths.get(depth);boolean complete=expected>0;
                    for(int i=1;i<=expected;i++)complete&=batch.containsKey(i);
                    if(complete&&depth>=completeDepth){completeDepth=depth;emitBatch("Analysing",batch);depths.headMap(depth).clear();}
                }
                if(kind.equals("best"))emitBatch("Ready",depths.getOrDefault(completeDepth,new TreeMap<>()));
            }
        }catch(Exception ignored){}
    }
    private void emitBatch(String status,TreeMap<Integer,JSONObject> batch)throws JSONException{JSONArray lines=new JSONArray();for(JSONObject line:batch.values())lines.put(line);emit(new JSONObject().put("id",clientId).put("status",status).put("depth",completeDepth).put("lines",lines));}
    private void stopPlay(){playToken=-1;if(opponent!=null)opponent.stop(++sequence);if(playRequest>=0){int request=playRequest;playRequest=-1;try{reply(request,new JSONObject().put("cancelled",true).put("bestmove",""));}catch(Exception ignored){}}}
    private void stopAll(){analysisToken=-1;if(analysis!=null)analysis.stop(++sequence);stopPlay();}
    private void send(String method,JSONObject value){if(!destroyed&&web!=null)web.evaluateJavascript("window.__nativeChess?."+method+"("+value+")",null);}
    private void reply(int request,JSONObject value)throws JSONException{send("reply",new JSONObject().put("requestId",request).put("value",value));}
    private void reject(int request,String error){try{send("reply",new JSONObject().put("requestId",request).put("error",error==null?"Engine unavailable.":error));}catch(Exception ignored){}}
    private void emit(JSONObject value){send("emit",value);}
    private void setWebActive(boolean value){if(web!=null&&!destroyed)web.evaluateJavascript("window.dispatchEvent(new Event('solitaire-"+(value?"resume":"pause")+"'))",null);}
    @Override protected void onPause(){active=false;stopAll();setWebActive(false);super.onPause();}
    @Override protected void onResume(){super.onResume();active=true;setWebActive(true);}
    @Override protected void onDestroy(){destroyed=true;stopAll();if(analysis!=null)analysis.close();if(opponent!=null)opponent.close();if(web!=null){web.removeJavascriptInterface("NativeChess");web.destroy();web=null;}super.onDestroy();}
    private void openExternal(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){new AlertDialog.Builder(this).setMessage("No browser is available to open this link.").setPositiveButton("OK",null).show();}}
    private void showInformation(){
        new AlertDialog.Builder(this).setTitle("About Solitaire Chess").setMessage("Play and analyse chess offline. Stockfish 19 runs on this device. No account, Google Play Services, ads, tracking or network permission is required. Your game is saved on this device.\n\nAndroid app and Stockfish: GPLv3 or later. Shared interface: MIT. Chess rules: chess.js (BSD-2-Clause).\n\n© 2026 Pete Riley · Version 1.0.0")
            .setPositiveButton("Done",null).setNeutralButton("More",(dialog,which)->new AlertDialog.Builder(this).setTitle("Support and licences").setItems(new String[]{"Support","Privacy policy","Android source and build instructions","GPLv3 licence","Other component licences"},(d,index)->{
                switch(index){case 0:openExternal("https://thepeteriley.github.io/solitaire-chess-support/");break;case 1:openExternal("https://thepeteriley.github.io/solitaire-chess-support/privacy.html");break;case 2:openExternal("https://github.com/thepeteriley/solitaire-chess-android");break;case 3:showText("GPLv3 licence","COPYING");break;case 4:showText("Component licences","ThirdPartyNotices.txt");break;}
            }).show()).show();
    }
    private void showText(String title,String asset){try{String text;try(InputStream input=getAssets().open(asset)){ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);text=new String(output.toByteArray(),StandardCharsets.UTF_8);}TextView view=new TextView(this);view.setText(text);view.setTextIsSelectable(true);view.setPadding(24,16,24,16);ScrollView scroll=new ScrollView(this);scroll.addView(view);new AlertDialog.Builder(this).setTitle(title).setView(scroll).setPositiveButton("Done",null).show();}catch(Exception e){reject(0,"Unable to read licence.");}}
}
