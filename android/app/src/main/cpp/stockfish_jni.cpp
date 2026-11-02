// SPDX-License-Identifier: GPL-3.0-or-later
#include <jni.h>
#include <algorithm>
#include <atomic>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>
#include "engine.h"
#include "attacks.h"
#include "position.h"
#include "movegen.h"
#include "uci.h"
#include "misc.h"
using namespace Stockfish;
static JavaVM* vm;
static std::once_flag initialized;
static std::string str(JNIEnv* env, jstring value) {
    const char* chars=env->GetStringUTFChars(value,nullptr); std::string result(chars); env->ReleaseStringUTFChars(value,chars); return result;
}
static std::string jsonQuote(const std::string& s) {
    std::string out="\"";
    for (unsigned char c:s) { if(c=='"'||c=='\\') {out+='\\';out+=c;} else if(c<32) out+=' '; else out+=c; }
    return out+'"';
}
struct Slot {
    std::string directory;
    jobject callback;
    jmethodID receive;
    std::unique_ptr<Engine> engine;
    std::atomic<Engine*> active{nullptr};
    std::atomic<long long> generation{0};
    void send(long long token, const std::string& content) {
        if(generation.load()!=token)return;
        JNIEnv* env=nullptr; bool attached=false;
        if(vm->GetEnv(reinterpret_cast<void**>(&env),JNI_VERSION_1_6)!=JNI_OK) {if(vm->AttachCurrentThread(&env,nullptr)!=JNI_OK)return;attached=true;}
        jstring text=env->NewStringUTF(("{\"token\":"+std::to_string(token)+","+content+"}").c_str());
        env->CallVoidMethod(callback,receive,text);env->DeleteLocalRef(text);
        if(env->ExceptionCheck())env->ExceptionClear();
        if(attached)vm->DetachCurrentThread();
    }
};
extern "C" JNIEXPORT jint JNI_OnLoad(JavaVM* machine,void*) {vm=machine;return JNI_VERSION_1_6;}
extern "C" JNIEXPORT jlong JNICALL Java_com_peteriley_solitairechess_EngineSlot_create(JNIEnv* env,jobject self,jstring directory) {
    auto slot=new Slot();slot->directory=str(env,directory);slot->callback=env->NewGlobalRef(self);
    jclass cls=env->GetObjectClass(self);slot->receive=env->GetMethodID(cls,"receive","(Ljava/lang/String;)V");env->DeleteLocalRef(cls);
    return reinterpret_cast<jlong>(slot);
}
extern "C" JNIEXPORT void JNICALL Java_com_peteriley_solitairechess_EngineSlot_cancel(JNIEnv*,jobject,jlong handle,jlong token) {
    auto slot=reinterpret_cast<Slot*>(handle);slot->generation.store(token);
    if(auto active=slot->active.load())active->stop();
}
extern "C" JNIEXPORT void JNICALL Java_com_peteriley_solitairechess_EngineSlot_search(JNIEnv* env,jobject,jlong handle,jlong token,jstring fenValue,jstring initialValue,jobjectArray movesValue,jint multiPV,jint elo,jint milliseconds) {
    auto slot=reinterpret_cast<Slot*>(handle);if(slot->generation.load()!=token)return;
    try {
        std::call_once(initialized,[]{Attacks::init();Position::init();});
        if(!slot->engine) {slot->engine=std::make_unique<Engine>(std::filesystem::path(slot->directory)/"SolitaireChess");slot->engine->set_on_verify_network([](std::string_view){});slot->active.store(slot->engine.get());}
        auto& engine=*slot->engine;engine.stop();engine.wait_for_search_finished();
        if(slot->generation.load()!=token)return;
        auto option=[&](const std::string& name,const std::string& value){std::istringstream command("name "+name+" value "+value);engine.get_options().setoption(command);};
        option("Threads","1");option("Hash","16");option("MultiPV",std::to_string(std::clamp<int>(multiPV,1,5)));
        option("UCI_LimitStrength",elo>0?"true":"false");if(elo>0)option("UCI_Elo",std::to_string(std::clamp<int>(elo,1320,3190)));
        std::string fen=str(env,fenValue),initial=str(env,initialValue);std::vector<std::string> moves;
        for(jsize i=0;i<env->GetArrayLength(movesValue);++i){auto move=static_cast<jstring>(env->GetObjectArrayElement(movesValue,i));moves.push_back(str(env,move));env->DeleteLocalRef(move);}
        if(engine.set_position(initial,moves)||engine.fen()!=fen){slot->send(token,"\"kind\":\"error\",\"message\":\"Invalid position or move history.\"");return;}
        Position position;StateInfo state;position.set(fen,false,&state);
        int count=std::min<int>(multiPV,MoveList<LEGAL>(position).size()),sign=fen.find(" b ")!=std::string::npos?-1:1;
        slot->send(token,"\"kind\":\"start\",\"count\":"+std::to_string(count));
        engine.set_on_update_full([slot,token,sign](const Engine::InfoFull& info){
            std::istringstream score(UCIEngine::format_score(info.score));std::string type;int value=0;score>>type>>value;
            std::string evaluation="{\"type\":"+jsonQuote(type)+",\"value\":"+std::to_string(value*sign);
            if(!info.bound.empty()){std::string bound(info.bound);if(sign<0)bound=bound=="lowerbound"?"upperbound":"lowerbound";evaluation+=",\"bound\":"+jsonQuote(bound);}evaluation+='}';
            std::istringstream continuation(std::string(info.pv));std::string move,pv="[";bool first=true;
            while(continuation>>move){if(!first)pv+=',';first=false;pv+=jsonQuote(move);}pv+=']';
            slot->send(token,"\"kind\":\"info\",\"depth\":"+std::to_string(info.depth)+",\"rank\":"+std::to_string(info.multiPV)+",\"score\":"+evaluation+",\"pv\":"+pv+",\"nodes\":"+std::to_string(info.nodes)+",\"timeMs\":"+std::to_string(info.timeMs));
        });
        engine.set_on_update_no_moves([](const Engine::InfoShort&){});engine.set_on_iter([](const Engine::InfoIter&){});engine.set_on_start([]{});
        engine.set_on_bestmove([slot,token](std::string_view best,std::string_view){slot->send(token,"\"kind\":\"best\",\"bestmove\":"+jsonQuote(std::string(best)));});
        Search::LimitsType limits;limits.startTime=now();limits.movetime=std::clamp<int>(milliseconds,100,3000);limits.depth=18;
        if(slot->generation.load()!=token)return;engine.go(limits);engine.wait_for_search_finished();
    } catch(const std::exception& error) {slot->send(token,"\"kind\":\"error\",\"message\":"+jsonQuote(error.what()));}
}
extern "C" JNIEXPORT void JNICALL Java_com_peteriley_solitairechess_EngineSlot_destroy(JNIEnv* env,jobject,jlong handle) {
    auto slot=reinterpret_cast<Slot*>(handle);slot->active.store(nullptr);slot->engine.reset();env->DeleteGlobalRef(slot->callback);delete slot;
}
