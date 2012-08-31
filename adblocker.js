// A Banshee Douban FM plugin extension for Gnome-shell
// Copyright (C) 2012 Meng Zhuo <mengzhuo1203@gmail.com>
// 
// The Banshee Douban FM plugin require version >= 0.3
// Version 0.3.4
// This file content an experiment way to block the advertisement from DoubanFM
// Example structure of the JSON acknowledge:
//{"ad-list":['song title of ad'],"version":YYYYMMDD}


const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Util = imports.misc.util;
const Lang = imports.lang;
const Soup = imports.gi.Soup;
const NMClient = imports.gi.NMClient;
const Extension = imports.misc.extensionUtils.getCurrentExtension();


const AD_LIST_URI = 'http://mengzhuo.org/doubanfm/ad_list.php?t=json'; //temp solution from my personal site.
const USER_AGENT = 'D.F.M.A.L Bot S.version:%s'.format(Extension.metadata["shell-version"]);
const TIME_OUT = 1000;
const DURATION_IN_M_SEC = 432000000; // update interval is five day 1000*3600*24*5
const JSON_CONTENT_TYPE = 'application/json';
const LOCAL_CACHE_FILE_URI = '%s/ad_list_cache.json'.format(Extension.dir.get_path());
const LOCAL_JSON_CONTENT_TYPE = "text/plain";
const JSON_FILTER = ['ad-list','version'];

const Session = new Soup.SessionAsync({timeout:TIME_OUT,
                                        user_agent:USER_AGENT,
                                        max_conns_per_host:1
                                        });
Soup.Session.prototype.add_feature.call(Session, new Soup.ProxyResolverDefault());

//adList can be initialized by 
//param: caller, ad_list_uri

const AdBlocker = new Lang.Class({
    
    Name:'DoubanFM.adBlocker',
    
    _init:function(){
    
        let args = arguments;
        
        this._delegate = ( args[0] instanceof Object)?args[0]:null;
        
        this.uri_string = ( (args[1] instanceof String) && args[1].match(Util._urlRegexp) != null )?args[1]:AD_LIST_URI;
        
        this._msg = Soup.Message.new('GET',this.uri_string);
        
        this._cancelHandler = new Gio.Cancellable();
        
        this._localFile = Gio.file_new_for_path(LOCAL_CACHE_FILE_URI);
        
        this._networkClient =  NMClient.Client.new();
        
        this.updateList();
    },
    updateList: function (){
    
        this.loadLocal();
        
        let callback;
        
        let currentTime = (new Date).getTime();
        
        let fileModiTime = this._localFile.query_exists(this._cancelHandler)?this._localFile.modificationTime*1000:0;
        
        // XXX it must be an easier way
        let mainConnection = this._networkClient.get_active_connections() || null;
        
        
        if ( !(this.list instanceof Array)  || currentTime-fileModiTime > DURATION_IN_M_SEC){

            if (mainConnection != null){
                Session.queue_message(this._msg, Lang.bind(this,this._onRequestCompleted),callback);
            }
        }
        
    },
    
    _onRequestCompleted: function (session,msg,callback){
        
        if ( msg.status_code == 200 ){
            
            try {
                // we need to check the header, therefor no Gio.new_for_uri
                let type = msg.response_headers.get_content_type();
                
                if (type.indexOf(JSON_CONTENT_TYPE) == -1)
                    throw new Error('Type %s is not a JSON'.format(type));
                
                this._remoteJson = JSON.parse(msg.response_body.data);
                
                let version = this._remoteJson["version"];
                let list    = this._remoteJson["ad-list"];
                
                if ( typeof(version) != 'number' || version < 20120729 || !(list instanceof Array) )
                    throw new Error('JSON "%s"... is not a valid DataBase'.format( data.slice(0,10)) );

                if ( this.version != version ){
                
                    this.list = list;
                    
                    this.version = version;
                    
                    this._json = this._remoteJson;
                    
                    this._saveLocal();
                }
                
            }catch(e){
                throw new Error('[AdBlocker][Error]:%s'.format(e.message));
            }
        }
        else{
            this._warn('Requested URI: %s%s [HTTP-STATUS:%d]'.format(msg.uri.host,msg.uri.path,
                                                                            msg.status_code));
        }
    },
    
    loadLocal : function (){
        if ( this._localFile.query_exists(this._cancelHandler) ){
            
            [flag, data, mTime] = this._localFile.load_contents(this._cancelHandler);
            
            if (flag){
                try {
                    this._json = JSON.parse(data);
                    this.list = this._json["ad-list"];
                    this.version = this._json["version"];
                    this._localFile.modificationTime = mTime.split(':')[0];
                    
                }
                catch(e){
                    this._warn(e.message);
                }
            }
        }else{
            this._warn('Local cache:%s [Not EXISTS]'.format( this._localFile.get_path() ) );
        }
    },
    
    _saveLocal : function (){
        try {
            if (!this._localFile.query_exists(this._cancelHandler)){
                
                this._localFile.create(Gio.FileCreateFlags.NONE,this._cancelHandler);
            }
            
            //for UTF8 character covert
            this._localFile.replace_contents(
                unescape( encodeURIComponent( JSON.stringify(this._remoteJson,JSON_FILTER) ) ),
                null,false,Gio.FileCreateFlags.NONE,this._cancelHandler);
                
             //Yes, Update
        
        }catch(e){
            this._warn(e.message);
        }
        finally{
            this.loadLocal();
        }
    },
    
    _onDestroy : function (){

        this._cancelHandler.cancel(); //stop all file related activities
        Session.cancel_message(this._msg,2); //stop all HTTP related activities
    },
    
    destroy : function (){
        this._onDestroy();
    },
    
    _warn : function (msg){
    
        if ( !(msg instanceof String) )
                msg = msg.toString();
        
        global.log('[AdBlocker][Warning]'+msg);
    }
});
