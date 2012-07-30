const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const DBFMUtil = Extension.imports.util;


const Gettext = imports.gettext.domain('banshee-doubanfm-gse');
const _ = Gettext.gettext;
const DONATION_URI = "http://amzn.com/w/D4WJ5SD3PW5W";


const DoubanFMSettingsWidget = new GObject.Class({
    Name: 'DoubanFMConfigurator.Prefs.DoubanFMSettingsWidget',
    GTypeName: 'DoubanFMConfiguratorSettingsWidget',
    Extends: Gtk.Grid,
    
    _init : function (params){
    
        this.parent(params);
        this.margin = this.row_spacing = this.column_spacing = 6;
        
        this._settings = DBFMUtil.getSettings();
        this._showText  = this._settings.get_boolean('show-text');
        this._charLimit = this._settings.get_int('char-limit');
        
        this._position  = this._settings.get_enum('doubanfm-position');
        this._firstTime = this._settings.get_boolean('first-time');
        
        this.attach(new Gtk.Label({ label: "", wrap: true, xalign: 0.0 }), 0, 0, 1, 1);
        this.attach(new Gtk.Label({ label: _("Show Song Title"), wrap: true, xalign: 0.0 }), 1, 0, 1, 1);
        this._showTextSwitch = new Gtk.Switch({active: this._showText});
        this.attach(this._showTextSwitch,2,0,1,1);
        this._showTextSwitch.connect('notify::active', Lang.bind(this, this._setShowText));
        
        this.attach(new Gtk.Label({ label:'CJK '+_("Character Number Limit"), wrap: true, xalign: 0.0 }), 1, 1, 1, 1);
        this._adjustment = new Gtk.Adjustment({value:this._charLimit,
                                              lower:1,
                                              upper:20,
                                              step_increment:1,
                                              page_increment:3
                                            });
        this._charLimitSpinButton = new Gtk.SpinButton({digits:0,
                                                         adjustment:this._adjustment,
                                                         max_length:2,
                                                         climb_rate:0
                                                       });
        this.attach(this._charLimitSpinButton,2, 1, 1, 1);
        this._adjustment.connect('value_changed', Lang.bind(this, this._setCharLimit));
        
        this.attach(new Gtk.Label({ label: _("Position in the Panel"), wrap: true, xalign: 0.0 }), 1, 2, 1, 1);
        let positionList = [ _("Left"), _("Center"), _("Right")];
        this.list = new Gtk.ListStore();
        this.list.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);

        for (let i in positionList){
            let iter = this.list.append();
            this.list.set(iter, [0, 1], [i, positionList[i]]);
        }
        
        this._positionComboBox = new Gtk.ComboBox({model:this.list,active:this._position});
        
        let renderer = new Gtk.CellRendererText();
        this._positionComboBox.pack_start(renderer, true);
        this._positionComboBox.add_attribute(renderer, 'text', 1);
        
        this.attach(this._positionComboBox,2,2,1,1);
        this.attach(new Gtk.Label({ label: "*", wrap: true, xalign: 0.0 }), 0, 2, 1, 1);
        this._positionComboBox.connect('changed', Lang.bind(this, this._setPosition));
        
        this.attach(new Gtk.Label({ label: "*", wrap: true, xalign: 0.0 }), 0, 3, 1, 1);
        this.attach(new Gtk.Label({ label: _("Display Help"), wrap: true, xalign: 0.0 }), 1, 3, 1, 1);
        this._firstTimeSwitch = new Gtk.Switch({active: this._firstTime});
        this.attach(this._firstTimeSwitch,2,3,1,1);
        this._showTextSwitch.connect('notify::active', Lang.bind(this, this._setFirstTime));
        
        let horzSeparator = new Gtk.HSeparator();
        this.attach(horzSeparator, 0, 5, 3, 1);
        
        this.attach(new Gtk.Label({ label: '* : ' + _("Need to restart Extension"), wrap: true, xalign: 0.0 }), 1, 6, 1, 1);
        this.donation = new Gtk.Button({ label:"Donate"});
        this.attach (this.donation, 2,6,1,1);
        this.donation.connect('clicked',Lang.bind(this,this._makeDonation));
    },
    _setShowText: function (object){
        this._charLimitSpinButton.editable = this._showText = object.active;
        this._settings.set_boolean('show-text',object.active);
    },
    _setFirstTime : function (object){
        this._settings.set_boolean('first-time',object.active);
    },
    _setCharLimit : function (object){
        //print(object.value);
        this._settings.set_int('char-limit',object.value);
    },
    _setPosition :function (){
        let [success, iter] = this._positionComboBox.get_active_iter();
        if (!success)
            return;
        
        let position = this.list.get_value(iter, 0);
        this._settings.set_enum('doubanfm-position',position);
        this._position  = this._settings.get_enum('doubanfm-position');
    },
    _makeDonation : function (){
        GLib.spawn_command_line_async('gnome-open %s'.format(DONATION_URI))
    }
});

function init() {
    DBFMUtil.initTranslations();
}

function buildPrefsWidget() {
    let widget = new DoubanFMSettingsWidget();
    widget.show_all();
    return widget;
}
