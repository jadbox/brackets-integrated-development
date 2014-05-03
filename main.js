/**
(c) by Victor Hornets
Allow to run build programs (such as running Python/Ruby/Node/etc scripts) from Brackets and display results in panel. It is possible to create own build systems via 'Edit>Edit Builder' menu item and editing opened JSON-file (you need to restart Brackets).
**/

/*jslint plusplus: true, vars: true, nomen: true */
/*global define, brackets, console, setTimeout, $, document, alert */

define(function (require, exports, module) {
    "use strict";
    var ext_name = "Brackets Compiler Support",
        ext_name_notify = "[[" + ext_name + "]]";
    var AppInit = brackets.getModule("utils/AppInit"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Menus = brackets.getModule("command/Menus"),
        NodeConnection = brackets.getModule("utils/NodeConnection"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        KeyBindingManager = brackets.getModule('command/KeyBindingManager'),
        FileUtils = brackets.getModule("file/FileUtils"),
        PanelManager = brackets.getModule("view/PanelManager"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        nodeConnection = new NodeConnection(),
        domainPath = ExtensionUtils.getModulePath(module) + "domain",
        EditorManager = brackets.getModule("editor/EditorManager"),
        CodeMirror = brackets.getModule("thirdparty/CodeMirror2/lib/codemirror");

    //load code mirror addons
    //brackets.getModule(["thirdparty/CodeMirror2/addon/fold/brace-fold"]);
    //brackets.getModule(["thirdparty/CodeMirror2/addon/fold/comment-fold"]);
   // brackets.getModule(["thirdparty/CodeMirror2/addon/fold/markdown-fold"]);
    //require("linetoken")();
    
    var curOpenDir,
        curOpenFile,
        curOpenLang,
        cmd = '',
        linereg,
        pastLineErrors = [];

    var builders = JSON.parse(require('text!builder.json')),
        panel,
        panelHTML = require('text!brackets-builder-panel.html'),
        panelIsVisible = false;

    function _processCmdOutput(data) {
        data = JSON.stringify(data);
        data = data.replace(/\\n/g, '<br />').replace(/\"/g, '').replace(/\\t/g, '');
        return data;
    }
    function handle_success(msg) {
        console.log("Success from compiler: " + msg);
        $('#builder-panel .builder-content').html(_processCmdOutput(msg));
        panel.show();
    }
    
    function reset_errors() {
        var cm = EditorManager.getFocusedEditor()._codeMirror;
        cm.clearGutter("compiler-gutter");
        while (pastLineErrors.length > 0) {
            var cur = pastLineErrors.pop();
            cm.removeLineClass(cur, "background");
        }
    }
    
    function add_errors(line, msg) {
        pastLineErrors.push(line);
        var cm = EditorManager.getFocusedEditor()._codeMirror;
        var e = document.createElement('span');
        e.appendChild(document.createTextNode("●●●"));
        e.style.color = "red";
        e.style.size = 18;
        e.style.textAlign = "right";
        e.title = msg;
        cm.setGutterMarker(line, "compiler-gutter", e);
        cm.addLineClass(line, "background", "compiler-error");
        cm.refresh();
    }
    
    function make_gutter() {
        var cm = EditorManager.getFocusedEditor()._codeMirror;
        var hasGutter = false;
        var i, n;
        for (i = 0, n = cm.getOption('gutters'); i < n.length; i++) { hasGutter = hasGutter || n[i] === 'compiler-gutter'; }
        if (!hasGutter) { cm.setOption('gutters', ["compiler-gutter"].concat(cm.getOption('gutters'))); }
    }
    
    function handle_error(msg) {
        console.log("Fail from compiler: " + msg);
        $('#builder-panel .builder-content').html(":::" + _processCmdOutput(msg));
        panel.show();
        
        // Set Gutter
        make_gutter();
        
        var msgs = msg.split("\\n"),
            hadErrors = false;
        var i;
        for (i = 0; i < msgs.length; i++) {
            var arr = linereg.exec(msgs[i]);
            hadErrors = hadErrors || !!arr;
            if (arr) { add_errors(+(arr[1]) - 1, msgs[i]); }
        }
    }
    
    function handle() {
        reset_errors(); // remove past error markers
        curOpenDir = DocumentManager.getCurrentDocument().file._parentPath;
        curOpenFile = DocumentManager.getCurrentDocument().file._path;
        curOpenLang = DocumentManager.getCurrentDocument().language._name;

        nodeConnection.connect(true).fail(function (err) {
            console.error(ext_name_notify + "Cannot connect to node: ", err);
        }).then(function () {
            console.log('Building ' + curOpenLang + ' in ' + curOpenFile + '...\n');

            return nodeConnection.loadDomains([domainPath], true).fail(function (err) {
                console.error(ext_name_notify + " Cannot register domain: ", err);
            });
        }).then(function () {
            builders.forEach(function (el) {
                if (el.name.toLowerCase() === curOpenLang.toLowerCase()) {
                    cmd = el.cmd;
                    linereg = new RegExp(el.linereg);
                }
            });
            //.replace(" ", "\\ ")
            cmd = cmd.replace("$FILE", curOpenFile);
        }).then(function () {
            nodeConnection.domains["builder.execute"].exec(curOpenDir, cmd)
                .fail(handle_error)
                .then(handle_success);
        }).done();
    }

    AppInit.appReady(function () {
        panel = PanelManager.createBottomPanel("brackets-builder-panel", $(panelHTML), 100);
        $('#builder-panel .close').on('click', function () {
            panel.hide();
        });

        CommandManager.register('Run', 'builder.build', handle);

        KeyBindingManager.addBinding('builder.build', 'Ctrl-Alt-B');

        // Add menu item to edit .json file
        var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);

        menu.addMenuDivider();
        // Create menu item that opens the config .json-file
        CommandManager.register("Edit Builder", 'builder.open-conf', function () {
            Dialogs.showModalDialog('', 'Brackets Builder Extention', 'You must restart Brackets after changing this file.');
            var src = FileUtils.getNativeModuleDirectoryPath(module) + "/builder.json";

            DocumentManager.getDocumentForPath(src).done(
                function (doc) {
                    DocumentManager.setCurrentDocument(doc);
                }
            );
        });

        menu.addMenuItem('builder.open-conf');
        menu.addMenuItem('builder.build');
        
        $("#main-toolbar div.buttons").append("<a href='#' id='Toolbar-Debug-And-Run' title='Run'>Run</a>").on("click", handle);
        
        // Load panel css
        ExtensionUtils.loadStyleSheet(module, "brackets-builder.css");
       
        
    });

});