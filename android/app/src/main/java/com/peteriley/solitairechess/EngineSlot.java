// SPDX-License-Identifier: GPL-3.0-or-later
package com.peteriley.solitairechess;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.json.JSONObject;
final class EngineSlot {
    static { System.loadLibrary("solitaire_stockfish"); }
    private final ExecutorService queue=Executors.newSingleThreadExecutor();
    private final Consumer<JSONObject> output;
    private final Runnable prepare;
    private long handle;
    private boolean closed;
    EngineSlot(String directory,Runnable prepare,Consumer<JSONObject> output){this.prepare=prepare;this.output=output;handle=create(directory);}
    synchronized void start(long token,String fen,String initial,String[] moves,int multiPV,int elo,int ms){
        if(closed)return;cancel(handle,token);final long slot=handle;
        queue.execute(()->{try{prepare.run();search(slot,token,fen,initial,moves,multiPV,elo,ms);}catch(Exception e){try{output.accept(new JSONObject().put("token",token).put("kind","error").put("message",e.getMessage()));}catch(Exception ignored){}}});
    }
    synchronized void stop(long token){if(!closed)cancel(handle,token);}
    synchronized void close(){if(closed)return;closed=true;final long slot=handle;cancel(slot,-1);queue.execute(()->destroy(slot));queue.shutdown();}
    @SuppressWarnings("unused") public void receive(String json){try{output.accept(new JSONObject(json));}catch(Exception ignored){}}
    private native long create(String directory);
    private native void cancel(long handle,long token);
    private native void search(long handle,long token,String fen,String initial,String[] moves,int multiPV,int elo,int milliseconds);
    private native void destroy(long handle);
}
