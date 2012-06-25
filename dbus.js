// A Banshee Douban FM plugin extension for Gnome-shell
// Copyright (C) 2012 Meng Zhuo<mengzhuo1203@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Lang = imports.lang;
const Gio = imports.gi.Gio;
const Signals = imports.signals;

const BUS_NAME = 'fm.douban.banshee';
const MS_BUS_PATH = '/org/bansheeproject/Banshee/PlayerEngine';
const CR_BUS_PATH = '/org/bansheeproject/Banshee/PlaybackController';
const DB_BUS_PATH = '/fm/douban/banshee';

const MEDIA_SERVER2_PLAYER_IFACE = <interface name="org.bansheeproject.Banshee.PlayerEngine">
    <method name="Open">
      <arg name="uri" direction="in" type="s" />
    </method>
    <method name="Close" />
    <method name="Pause" />
    <method name="Play" />
    <method name="TogglePlaying" />
    <signal name="EventChanged">
      <arg name="evnt" direction="out" type="s" />
      <arg name="message" direction="out" type="s" />
      <arg name="bufferingPercent" direction="out" type="d" />
    </signal>
    <signal name="StateChanged">
      <arg name="state" direction="out" type="s" />
    </signal>
    <property name="CurrentTrack" type="a{sv}" access="read" />
    <property name="CurrentUri" type="s" access="read" />
    <property name="CurrentState" type="s" access="read" />
    <property name="LastState" type="s" access="read" />
    <property name="Volume" type="q" access="readwrite" />
    <property name="Position" type="u" access="readwrite" />
    <property name="Rating" type="y" access="readwrite" />
    <property name="CanSeek" type="b" access="read" />
    <property name="CanPause" type="b" access="read" />
    <property name="Length" type="u" access="read" />
</interface>;

const BANSHEE_CONTROLLER = <interface name="org.bansheeproject.Banshee.PlaybackController">
    <method name="First" />
    <method name="Next">
      <arg name="restart" direction="in" type="b" />
    </method>
    <method name="Previous">
      <arg name="restart" direction="in" type="b" />
    </method>
    <method name="RestartOrPrevious">
      <arg name="restart" direction="in" type="b" />
    </method>
    <signal name="Stopped" />
    <property name="ShuffleMode" type="s" access="readwrite" />
    <property name="RepeatMode" type="i" access="readwrite" />
    <property name="StopWhenFinished" type="b" access="readwrite" />
</interface>;

const DBFM_INFO_IFACE = <interface name="fm.douban.banshee">
    <method name="Love" />
    <method name="CancelLove" />
    <method name="Hate" />
    <method name="GetChannelList">
      <arg name="ret" direction="out" type="a(sss)" />
    </method>
    <method name="ChangeChannel">
      <arg name="channelid" direction="in" type="s" />
    </method>
    <method name="GetPlayingSong">
      <arg name="ret" direction="out" type="(sssb)" />
    </method>
    <signal name="ChannelChanged">
      <arg name="channelid" direction="out" type="s" />
    </signal>
</interface>;

const DoubanFMServer = new Lang.Class({
        
        Name: 'DoubanFMServer',
        
        _init: function()
        {
            //connect to dbus
            var media2ServerInfo  = Gio.DBusInterfaceInfo.new_for_xml( MEDIA_SERVER2_PLAYER_IFACE );
            var controllerInfo    = Gio.DBusInterfaceInfo.new_for_xml( BANSHEE_CONTROLLER );
            var doubanFMInfo      = Gio.DBusInterfaceInfo.new_for_xml( DBFM_INFO_IFACE );
            
            this._media2Server = new Gio.DBusProxy({ g_connection: Gio.DBus.session,
			                                                   g_interface_name: media2ServerInfo.name,
			                                                   g_interface_info: media2ServerInfo,
			                                                   g_name: BUS_NAME,
			                                                   g_object_path: MS_BUS_PATH,
                                                               g_flags: (Gio.DBusProxyFlags.DO_NOT_AUTO_START) });
            this._media2Server.init(null);
            
            this._controller = new Gio.DBusProxy({ g_connection: Gio.DBus.session,
			                                                   g_interface_name: controllerInfo.name,
			                                                   g_interface_info: controllerInfo,
			                                                   g_name: BUS_NAME,
			                                                   g_object_path: CR_BUS_PATH,
                                                               g_flags: (Gio.DBusProxyFlags.DO_NOT_AUTO_START) });
            this._controller.init(null);
            
            this._doubanFMServer = new Gio.DBusProxy({ g_connection: Gio.DBus.session,
			                                                   g_interface_name: doubanFMInfo.name,
			                                                   g_interface_info: doubanFMInfo,
			                                                   g_name: BUS_NAME,
			                                                   g_object_path: DB_BUS_PATH,
                                                               g_flags: (Gio.DBusProxyFlags.DO_NOT_AUTO_START) });
            
            this._doubanFMServer.init(null);
            
            this.playbackStatus = this._media2Server.CurrentState;
            
                
            if ( this.playbackStatus == null )
                this.playbackStatus = 'idle'; //FIXME Banshee has no working DBUS property by using Dbus Proxy! here is a dirty workaround
            
            //connect to signal
            this._media2Server.connectSignal('StateChanged', Lang.bind(this, function(proxy, senderName, [status]){
                this.playbackStatus = status;
                this.emit('state-changed');
            } ));
            
            this.connect('destroy', Lang.bind(this, this._onDestroy));
            
        },
        love : function(){
        
            this._doubanFMServer.LoveRemote();
            this.emit('state-changed');
        },
        
        hate : function(){
        
            this._doubanFMServer.HateRemote();
            //It will be set to next song after set to hate
        },
        
        cancel_love : function(){
        
            this._doubanFMServer.CancelLoveRemote();
            this.emit('state-changed');
        },
        
        play_pause : function (){
        
            this._media2Server.TogglePlayingRemote();
        },
        next : function (){
        
            this._controller.NextRemote(false); 
            //Banshee need that false, but I found there is no difference if set it to true
        },
        
        _onDestroy : function ()
        {
            delete this._media2Server;
            delete this._doubanFMServer;
            delete this._controller;
        }
});
Signals.addSignalMethods(DoubanFMServer.prototype);
