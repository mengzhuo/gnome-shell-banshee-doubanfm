// A Banshee Douban FM plugin extension for Gnome-shell
// Copyright (C) 2012 Meng Zhuo <mengzhuo1203@gmail.com>
// 
// The Banshee Douban FM plugin require version >= 0.3
// Version 0.3.4
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


const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;
const Gtk = imports.gi.Gtk;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const DBusInterface = Extension.imports.dbus;
const DBFMUtil = Extension.imports.util;
const ADBlocker = Extension.imports.adblocker;

const Gettext = imports.gettext.domain('banshee-doubanfm-gse');
const _ = Gettext.gettext;

const PANEL_HEIGHT = Main.panel.actor.get_size()[1];
const ICON = {
    NOT_RUNNING  : "doubanFM-not-running",
    NONE        : "doubanFM-default",
    LOVE        : "doubanFM-love"
};
const POSITION = {
    LEFT   : 0,
    CENTER : 1,
    RIGHT  : 2
};

// Char Limit Slider helper functions quick and dirty
const CHAR_SLIDER_UPPER = 10;
const CHAR_SLIDER_LOWER = 2;

function _valueToCharLimits(value) {
    return Math.floor(value * (CHAR_SLIDER_UPPER - CHAR_SLIDER_LOWER) + CHAR_SLIDER_LOWER);
}

function _charLimitsToValue(charLimits) {
    return (charLimits - CHAR_SLIDER_LOWER) / (CHAR_SLIDER_UPPER - CHAR_SLIDER_LOWER);
}

const DoubanFMIndicator = new Lang.Class({
    
    Name: 'DoubanFMIndicator',
    
    Extends: PanelMenu.Button,
    
    _init : function()
    {
        this.parent(St.Align.START);
        this._playedCounter = 0;
        
        // Load default setting
        this._showText  = true;
        this._charLimit = 5;
        this._position   = POSITION.CENTER;
        
        // Load setting
        this._settings = DBFMUtil.getSettings();
        this._settingSiganlID = this._settings.connect('changed', Lang.bind(this, this._onSettingsChanged));
        
        //connect to dbus
        this._player = new DBusInterface.DoubanFMServer();
        this._player.connect('state-changed',Lang.bind(this,this._onStateChanged));
        this._player.connect('closed',Lang.bind(this,this._onDBFMDestroy));
        
        //connect to adblocker
        this._adblocker = new ADBlocker.AdBlocker();
        
        //UI START
        
        let prefWidth = this._showText?PANEL_HEIGHT*this._charLimit:0; //Fix length for good UE
        this.actor.set_width(prefWidth+PANEL_HEIGHT); // include the icon
        
        this._box = new St.BoxLayout({ vertical: false,
                                        style_class: "doubanFM"
                                     });
        this.actor.add_actor(this._box);

        //blur effect
        this._blur_effect = new Clutter.BlurEffect();
        this._blur_effect.enabled = false;
        this.actor.add_effect(this._blur_effect);
        
        // expand effect
        this.actor.connect('notify::hover', Lang.bind(this, this._onHover));
        
        //icon stuff
        let iconTheme = Gtk.IconTheme.get_default();
        
        if (!iconTheme.has_icon(ICON.NONE))
            iconTheme.append_search_path (Extension.dir.get_path()+'/icons');
        this._icon = new St.Icon({  style_class: 'popup-menu-icon',
                                    icon_name: ICON.NONE,
                                    icon_size: Math.round(PANEL_HEIGHT/2)
                                    });
        this._box.add_actor(this._icon);
        
        //label
        this._label = new St.Label({ text:'Initializing...',
                                      style_class: 'doubanFM-label'
                                     });
        
        this._box.add_actor(this._label);
        //UI END
        
        this.connect('destroy', Lang.bind(this, this._onDestroy));
        
        this._onSettingsChanged();
        this._updateLabel();
    },
    _onDBFMDestroy : function (){
        this.actor.hide();
    },
    _onCharLimitChanged : function (){
        this._settings.set_int('char-limit', _valueToCharLimits(this._charLimitSlider.value));
    },
    addToPanel : function (){
        switch (this._position){
            case POSITION.LEFT :
                Main.panel.addToStatusArea(this.__name__, this, 10, 'left');
            break;
            case POSITION.CENTER :
                Main.panel.addToStatusArea(this.__name__, this, 999, 'center');
            break;
            case POSITION.RIGHT :
                Main.panel.addToStatusArea(this.__name__, this, 0, 'right');
            break;
            default:
                throw new Error('DoubanFM position error');
        }
    },
    _onSettingsChanged : function (){
        
        this._showText  = this._settings.get_boolean('show-text');
        this._charLimit = this._settings.get_int('char-limit');
        this._position   = this._settings.get_enum('doubanfm-position');
        
                    
        let prefWidth = this._showText?Math.round(Math.max(PANEL_HEIGHT*2.5,(PANEL_HEIGHT*0.8)*this._charLimit)):0;
        //Fix length for good UE
        this.actor.set_width(prefWidth+Math.round(PANEL_HEIGHT*1.5)); // include the icon and its padding
        
        this._onStateChanged(); // to change UI
    },
    _onGetSongInfoCompleted : function (results){
        this._blur_effect.enabled = false
        if (results  == null)
            return;
        
        [this._title,this._album,this._performer,this._Loveit] = results[0];
        
        if ( this._adblocker.list != undefined && this._adblocker.list.indexOf(this._title) != -1 ){
            this._player.next();
            return true;
        }
        
        // 30songs*3min = 90min
        // Update list in about one and half hour and 
        // we don't need to run in Mainloop :)
        if ( this._playedCounter%30 == 0 )
            this._adblocker.updateList();
        
        if (this._player.loveToggled){ // workaround for Love toggled but no signal come out
            this._Loveit = this._player.loveStatus; 
            this._player.loveToggled = false;
        }
        this._updateLabel();
        return true;
    },
    _updateLabel : function (){
         if (this._player.playbackStatus != null && this._title != null){
                        
            this.actor.show();
            this._icon.icon_name = ICON.NONE;
            this._label.hide();
            this._icon.remove_style_class_name('loveit');
            this._icon.remove_style_class_name('not-running');
            
            if (this._showText){
                this._label.show();
            }
            
            if (this._Loveit){
                this._icon.icon_name = ICON.LOVE;
                this._icon.add_style_class_name('loveit'); 
                /* the color of gnome-shell will override the color in svg , here is an workaround*/
            }
            
            switch (this._player.playbackStatus){
                case 'paused' :
                    this._label.text = _('||');
                break;
                case 'playing':
                    this._label.text = this._title;
                break;
                default:
                    this._label.text = _('...');
            }
            
            var charLimit =  DBFMUtil.hasCJK(this._title)?this._charLimit:this._charLimit*2;
            
            if (this._title.length > charLimit){
                this._label.text = this._title.substring(0,charLimit)+"...";
            }
        }
        else{

            this._icon.icon_name = ICON.NOT_RUNNING;
            this._icon.add_style_class_name('not-running');
            this._label.text = _('Not Running');
            
            this.actor.hide();
            //in case some of users don't know this extension is running
        }
    },
    _onStateChanged : function (){
    
       this._player._doubanFMServer.GetPlayingSongRemote(Lang.bind(this,this._onGetSongInfoCompleted));
    },
    _onButtonPress: function(actor, event) {
        
        //Tell user that his action is in progress
        this._blur_effect.enabled = true;

        let button = event.get_button();
        // Here is a workaround as I don't know the namespace of middle button in Clutter
        if ( button == 1 ){ //left
             this._player.next();
        }
        if ( button == 2 ){ //middle
            this._player.hate();
        }
        if (button == 3){ //right
            if (this._Loveit){
                this._player.cancel_love();
            }
            else{
                this._player.love();
            }
        }
    },
    _onDestroy: function() {
    
        this._player._onDestroy();
        Main.panel.statusArea.DoubanFMIndicator.actor.destroy()
        this._settings.disconnect( this._settingSiganlID );
        delete Main.panel.statusArea.DoubanFMIndicator
    },
    
    _onHover : function(){
        this._label.text = this._title;
        global.log(this._title);
    }
    
});

function enable() {
    if (typeof Main.panel.statusArea.DoubanFMIndicator == 'undefined') {
        (new DoubanFMIndicator).addToPanel();
    }
}

function disable() {
    if (typeof Main.panel.statusArea.DoubanFMIndicator != 'undefined') {
        Main.panel.statusArea.DoubanFMIndicator._onDestroy();
    }
}
function init(metadata) {
    DBFMUtil.initTranslations('banshee-doubanfm-gse');
}
