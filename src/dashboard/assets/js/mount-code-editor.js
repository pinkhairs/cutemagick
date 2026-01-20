// Define your custom theme
ace.define("ace/theme/custom-pastel", ["require", "exports", "module", "ace/lib/dom"], function(require, exports, module) {
  exports.isDark = true;
  exports.cssClass = "ace-custom-pastel";
  exports.cssText = `
.ace-custom-pastel .ace_gutter {
    background: #2f3e57;
    color: #d9e0ea;
    opacity: 0.7;
}
  
.ace-custom-pastel .ace_print-margin {
    width: 1px;
    background: #3b4d6e;
}
  
.ace-custom-pastel {
    background-color: #232f41;
    line-height: 1.65 !important;
    color: #FFF1E7;
}
  
.ace-custom-pastel .ace_cursor {
    color: #FFF1E7;
}
  
.ace-custom-pastel .ace_marker-layer .ace_selection {
    background: rgba(255, 182, 239, 0.2);
}
  
.ace-custom-pastel.ace_multiselect .ace_selection.ace_start {
    box-shadow: 0 0 3px 0px #232f41;
}
  
.ace-custom-pastel .ace_marker-layer .ace_active-line {
    background: #516792;
}
  
.ace-custom-pastel .ace_gutter-active-line {
    background-color: #516792;
}
  
.ace-custom-pastel .ace_marker-layer .ace_selected-word {
    border: 1px solid rgba(255, 182, 239, 0.2);
}
  
.ace-custom-pastel .ace_invisible {
    color: #3b4d6e;
}
  
/* Keywords */
.ace-custom-pastel .ace_keyword,
.ace-custom-pastel .ace_meta,
.ace-custom-pastel .ace_storage,
.ace-custom-pastel .ace_storage.ace_type,
.ace-custom-pastel .ace_support.ace_type {
    color: #FFA3D8;
    font-weight: 600;
}
  
/* Strings */
.ace-custom-pastel .ace_string,
.ace-custom-pastel .ace_string.ace_regexp {
    color: #AAC6FF;
}
  
/* Numbers, constants */
.ace-custom-pastel .ace_constant,
.ace-custom-pastel .ace_constant.ace_numeric,
.ace-custom-pastel .ace_constant.ace_language,
.ace-custom-pastel .ace_constant.ace_character,
.ace-custom-pastel .ace_constant.ace_other {
    color: #D5A8FF;
}
  
/* Function & class names */
.ace-custom-pastel .ace_support.ace_function,
.ace-custom-pastel .ace_support.ace_class,
.ace-custom-pastel .ace_entity.ace_name.ace_function,
.ace-custom-pastel .ace_entity.ace_name.ace_class {
    color: #94FCC1;
}
  
/* Variables, params */
.ace-custom-pastel .ace_variable,
.ace-custom-pastel .ace_variable.ace_parameter {
    color: #FFE4FC;
}
  
/* Types */
.ace-custom-pastel .ace_entity.ace_name.ace_type,
.ace-custom-pastel .ace_entity.ace_other.ace_inherited-class {
    color: #65F0F5;
    font-style: italic;
}
  
/* Attributes, properties */
.ace-custom-pastel .ace_entity.ace_other.ace_attribute-name,
.ace-custom-pastel .ace_support.ace_constant,
.ace-custom-pastel .ace_meta.ace_tag,
.ace-custom-pastel .ace_variable.ace_language {
    color: #99BDFF;
}
  
/* Comments */
.ace-custom-pastel .ace_comment {
    color: #b8c4d6;
    font-style: italic;
}
  
/* Tags */
.ace-custom-pastel .ace_entity.ace_name.ace_tag {
    color: #FFA3D8;
}
  
/* Invalid */
.ace-custom-pastel .ace_invalid {
    color: #FFF1E7;
    background-color: #FFA3D8;
}
  
.ace-custom-pastel .ace_fold {
    background-color: #94FCC1;
    border-color: #FFF1E7;
}
  
.ace-custom-pastel .ace_indent-guide {
    background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEklEQVQImWNgYGBgYHB3d/8PAAOIAYDpjrZgAAAAAElFTkSuQmCC) right repeat-y;
}
  
.ace-custom-pastel .ace_scroller {
    font-family: 'Space Mono', monospace !important;
    font-size: 16px !important;
}
`;
  
  const dom = require("../lib/dom");
  dom.importCssString(exports.cssText, exports.cssClass, false);
});

// Listen for HTMX afterSwap event for dynamically loaded editors
document.body.addEventListener('htmx:afterSwap', function(evt) {
  const target = evt.detail.target;
  
  // Check if the target itself is an editor
  if (target.classList && target.classList.contains('editor')) {
    if (!target.classList.contains('ace-initialized')) {
      initializeEditor(target);
    }
    return;
  }
  
  // Otherwise, look for editors in the swapped content
  const editors = target.querySelectorAll('.editor:not(.ace-initialized)');
  
  editors.forEach((editorEl, index) => {
    initializeEditor(editorEl);
  });
});

function initializeEditor(editorEl) {
  if (!editorEl.id) {
    editorEl.id = `editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  try {
    const editor = ace.edit(editorEl.id);
    editor.setTheme("ace/theme/custom-pastel");
    
    // Get language from data attribute, or detect from file path
    let lang = editorEl.dataset.language;
    
    if (!lang || lang === '') {
      // Fallback: detect from file path
      const filePath = editorEl.dataset.filePath || '';
      const ext = filePath.split('.').pop().toLowerCase();
      
      const extMap = {
        'md': 'markdown',
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'php': 'php',
        'rb': 'ruby',
        'go': 'golang',
        'rs': 'rust',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'xml': 'xml',
        'sh': 'sh',
        'yaml': 'yaml',
        'yml': 'yaml'
      };
      
      lang = extMap[ext] || 'text';
    }
    
    editor.session.setMode(`ace/mode/${lang}`);
    
    editor.setOptions({
      fontSize: "16px",
      showPrintMargin: false,
      wrap: true
    });
    
    editorEl.classList.add('ace-initialized');
  } catch (error) {
    console.error('❌ Error initializing ACE editor:', error);
  }
}