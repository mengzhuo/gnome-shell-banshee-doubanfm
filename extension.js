// A Banshee Douban FM plugin extension for Gnome-shell
// Copyright (C) 2012 Meng Zhuo <mengzhuo1203@gmail.com>
// 
// The Banshee Douban FM plugin require version >= 0.3
// Version 0.3.3
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

const Gettext = imports.gettext.domain('banshee-doubanfm');
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
const CHAR_SLIDER_LOWER = 3;

function _valueToCharLimits(value) {
    return Math.floor(value * (CHAR_SLIDER_UPPER - CHAR_SLIDER_LOWER) + CHAR_SLIDER_LOWER);
}

function _charLimitsToValue(charLimits) {
    return (charLimits - CHAR_SLIDER_LOWER) / (CHAR_SLIDER_UPPER - CHAR_SLIDER_LOWER);
}
/* position setting in next version
const POSI_SLIDER_UPPER = 2;
const POSI_SLIDER_LOWER = 0;

function _valueToPositions(value) {
    return Math.floor(value * (POSI_SLIDER_UPPER - POSI_SLIDER_LOWER) + POSI_SLIDER_LOWER);
}

function _positionsToValue(position) {
    return (position - POSI_SLIDER_LOWER) / (POSI_SLIDER_UPPER - POSI_SLIDER_LOWER);
}
*/
// quick and dirty done

const DoubanFMIndicator = new Lang.Class({
    
    Name: 'DoubanFMIndicator',
    
    Extends: PanelMenu.Button,
    
    _init : function()
    {
        this.parent(St.Align.START);
        
        // Load default setting
        this._showText  = true;
        this._firstTime = true;
        this._charLimit = 5;
        this._position   = POSITION.CENTER;
        
        // Load setting
        this._settings = DBFMUtil.getSettings();
        this._settings.connect('changed', Lang.bind(this, this._onSettingsChanged));
        
        //connect to dbus
        this._player = new DBusInterface.DoubanFMServer();
        this._player.connect('state-changed',Lang.bind(this,this._onStateChanged));
        
        //UI START
        
        textLength = this._showText?Math.max(PANEL_HEIGHT*4,16*(this._charLimit+1)):0; //Fix length for good UE
        
        this._box = new St.BoxLayout({ vertical: false,
                                        style_class: "doubanFM",
                                        width: 26+textLength
                                     });
        this.actor.add_actor(this._box);
        
        //icon stuff
        let iconTheme = Gtk.IconTheme.get_default();
        
        if (!iconTheme.has_icon(ICON.NONE))
            iconTheme.append_search_path (Extension.dir.get_path()+'/icons');
        
        this._icon = new St.Icon({ icon_type: St.IconType.SYMBOLIC,
                                    style_class: 'popup-menu-icon',
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
        this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
        
        this._onSettingsChanged();
    },
    
    _introduction  : function (){
    
        //introduction title 
        let item = new PopupMenu.PopupMenuItem(_('How to use Douban FM'), { reactive: false });
        this.menu.addMenuItem(item);
        
        this.menu.actor.add_style_class_name("doubanfm-popup");
        
        vbox = new St.BoxLayout({vertical:true,
                                 style_class: 'doubanfm-vbox'});
        
        item = new St.Label({ text:_("Three ways to control by click\nthe label above after you've\ndone the setting"),
                               style_class: 'title'});
        vbox.add_actor(item);
        
        textList = [ [_( "Left"),_("Next Song")],
                     [_( "Middle"),_("Dislike")],
                     [_( "Right"),_("Love Toggle")]
                   ];
        
        for (var i  in textList){
            hbox = new St.BoxLayout({vertical:false,style_class: 'hbox-item'});
                        
            eoF = (i%2 == 1)?'even':'odd'; 
            hbox.add_style_class_name(eoF);
            //FIXME It's weird that "nth-child(even)" selector won't work , Here is a workaround
            
            click = new St.Label({ text:textList[i][0],style_class: 'click'});
            description = new St.Label({ text:textList[i][1],style_class: 'description'});
            hbox.add_actor(click);
            hbox.add_actor(description);
            vbox.add_actor(hbox);
        }
        
        this._introducator =  new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._introducator.addActor(vbox);
        this._introducator.addActor(new St.Bin({ style_class: "intro-img" }), {align: St.Align.END});
        
        this.menu.addMenuItem(this._introducator);
        
        item = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(item);
        
        //setting title 
        let item = new PopupMenu.PopupMenuItem(_('Douban FM Setting'), { reactive: false });
        this.menu.addMenuItem(item);
        
        this._showTextSwitch = new PopupMenu.PopupSwitchMenuItem(_("Show Song Title"),this._showText);
        this._showTextSwitch.connect('toggled', Lang.bind(this, function(item) {
            this._settings.set_boolean('show-text', item.state);
        }));
        this.menu.addMenuItem(this._showTextSwitch);
        
        //char limit
        this._charLimitTitle = new PopupMenu.PopupMenuItem(_("CJK Character Limit"), { reactive: false });
        this._charLimitLabel = new St.Label({ text: this._charLimit+_(' letters') });
        this._charLimitSlider = new PopupMenu.PopupSliderMenuItem(_charLimitsToValue(this._charLimit));
        this._charLimitSlider.connect('value-changed', Lang.bind(this, function(item) {
            this._charLimitLabel.set_text(_valueToCharLimits(item.value)+_(' letters'));
        }));
        
        this._charLimitSlider.connect('drag-end', Lang.bind(this, this._onCharLimitChanged));
        this._charLimitSlider.actor.connect('scroll-event', Lang.bind(this, this._onCharLimitChanged));
        this._charLimitTitle.addActor(this._charLimitLabel, { align: St.Align.END });
        this.menu.addMenuItem(this._charLimitTitle);
        this.menu.addMenuItem(this._charLimitSlider);
        
        
        //position in next version
        /*
        this._positionTitle = new PopupMenu.PopupMenuItem(_("Position Setting"), { reactive: false });
        this._positionLabel = new St.Label({ text: this._position });
        this._positionSlider = new PopupMenu.PopupSliderMenuItem( _positionsToValue(this._position,id) );
        this._positionSlider.connect('value-changed', Lang.bind(this, function(item) {
            this._positionLabel.set_text(_valueToPositions(item.value)+_(' letters'));
        }));
        
        this._positionSlider.connect('drag-end', Lang.bind(this, this._onPositionChanged));
        this._positionSlider.actor.connect('scroll-event', Lang.bind(this, this._onPositionChanged));
        this._positionTitle.addActor(this._positionLabel, { align: St.Align.END });
        this.menu.addMenuItem(this._positionTitle);
        this.menu.addMenuItem(this._positionSlider);
        */
        
        
        //Setting 
        this._nextTimeSwitch = new PopupMenu.PopupMenuItem(_("I've done setting"),{reactive:true});
        this._nextTimeSwitch.connect('activate', Lang.bind(this, this._onToggled));
        this.menu.addMenuItem(this._nextTimeSwitch);
        
    },
    _onCharLimitChanged : function (){
        this._settings.set_int('char-limit', _valueToCharLimits(this._charLimitSlider.value));
    },
    __onPositionChanged : function (){
        //this._settings.set_enum('doubanfm-position',this._combo);
        return false;
    },
    addToPanel : function (){
        switch (this._position){
            case POSITION.LEFT :
                Main.panel._leftBox.add_actor(this.actor);
                Main.panel._menus.addMenu(this.menu);
            break;
            case POSITION.CENTER :
                Main.panel._centerBox.add_actor(this.actor);
                Main.panel._menus.addMenu(this.menu);
            break;
            case POSITION.RIGHT :
                Main.panel.addToStatusArea('DoubanFMIndicator',this,-1);
            break;
            default:
                global.logError('DoubanFM position error');
        }
        if (this._firstTime)
            this._introduction();
    },
    _onToggled : function (item){
        this._settings.set_boolean('first-time',false);
        this.menu.close();
        this.menu = null;
    },
    _onSettingsChanged : function (){
        
        this._showText  = this._settings.get_boolean('show-text');
        this._charLimit = this._settings.get_int('char-limit');
        this._firstTime = this._settings.get_boolean('first-time');
        this._position   = this._settings.get_enum('doubanfm-position');
        
        this._onStateChanged(); // to change UI
    },
    _onStateChanged : function ()
    {        
        [this._title,this._album,this._performer,this._Loveit] = this._player.get_song_info();
        
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
            
            if (!this._firstTime)
                this.actor.hide(); // in case some of users don't know this extension is running
        }
    },
    _onButtonPress: function(actor, event) {
        
        if (!this._firstTime){
        
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
        }
        else{
            this.menu.toggle();
        }
        return true;
    },
    _onDestroy: function() {
    
        this._player.destroy();
        
        switch (this._position){
            case POSITION.LEFT :
                Main.panel._leftBox.remove_actor(this.actor);
                Main.panel._menus.removeMenu(this.menu);
            break;
            case POSITION.CENTER :
                Main.panel._centerBox.remove_actor(this.actor);
                Main.panel._menus.removeMenu(this.menu);
            break;
            case POSITION.RIGHT :
                Main.panel.addToStatusArea('DoubanFMIndicator',this,-1);
            break;
            default:
                global.logError('DoubanFM position error');
        }
        
    }
    
});

let indicator;

function enable() {
    if (!indicator) {
        indicator = new DoubanFMIndicator();
        indicator.addToPanel();
    }
}

function disable() {
    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
}
function init(metadata) {
    DBFMUtil.initTranslations();
}
