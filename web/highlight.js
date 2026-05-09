// @ctx .context/web/highlight.ctx
const t=new Set(["async","await","break","case","catch","class","const","continue","debugger","default","delete","do","else","export","extends","finally","for","from","function","if","import","in","instanceof","let","new","of","return","super","switch","this","throw","try","typeof","var","void","while","with","yield","static","get","set"]),n=new Set(["true","false","null","undefined","NaN","Infinity"]),s=new Set(["console","document","window","global","process","module","require","Promise","Array","Object","String","Number","Boolean","Map","Set","WeakMap","WeakSet","Symbol","RegExp","Error","JSON","Math","Date","parseInt","parseFloat","setTimeout","setInterval","clearTimeout","clearInterval","fetch","URL","Buffer","EventTarget","CustomEvent","HTMLElement","requestAnimationFrame","queueMicrotask"]);function e(t){return"&"===t?"&amp;":"<"===t?"&lt;":">"===t?"&gt;":t}
export function highlight(i){const l=[],f=i.length;
let h=0;for(;h<f;){const g=i[h];if("/"===g&&"/"===i[h+1]){const t=h;for(;h<f&&"\n"!==i[h];)h++;l.push(`<span class="t-cm">${a(i,t,h)}</span>`);continue}if("/"===g&&"*"===i[h+1]){const t=h;for(h+=2;h<f&&("*"!==i[h]||"/"!==i[h+1]);)h++;if(h<f-1)h+=2;else h=f;
const n=i.substring(t,h);n.startsWith("/**")?l.push(u(n)):l.push(`<span class="t-cm">${a(i,t,h)}</span>`);continue}if("/"===g&&h+1<f&&"*"!==i[h+1]&&"/"!==i[h+1]){
    let isRegex = false;
    let prev = h - 1;
    while(prev >= 0 && (i[prev]===" "||i[prev]==="\t"||i[prev]==="\n")) prev--;
    if (prev < 0 || "=([{;:,!?&|<>+-*%~/^".includes(i[prev])) isRegex = true;
    if (isRegex) {
      const t=h;
      for(h++;h<f&&"\n"!==i[h]&&"/"!==i[h];){
        "\\"===i[h]&&h++;
        h++;
      }
      if(h<f&&"/"===i[h]){
        h++;
        while(h<f&&c(i[h])) h++;
      }
      l.push(`<span class="t-str">${a(i,t,h)}</span>`);
      continue;
    }
  }
  if("'"===g||'"'===g){const t=h;for(h++;h<f&&i[h]!==g;)"\\"===i[h]&&h++,h++;if(h<f)h++;l.push(`<span class="t-str">${a(i,t,h)}</span>`);continue}if("`"===g){const t=h;for(h++;h<f&&"`"!==i[h];)"\\"===i[h]&&h++,h++;if(h<f)h++;l.push(highlightTemplateLiteral(i.substring(t,h)));continue}if(r(g)||"."===g&&h+1<f&&r(i[h+1])){const t=h;if("0"!==g||"x"!==i[h+1]&&"X"!==i[h+1])for(;h<f&&(r(i[h])||"."===i[h]||"e"===i[h]||"E"===i[h]||"_"===i[h]);)h++;else for(h+=2;h<f&&o(i[h]);)h++;h<f&&"n"===i[h]&&h++,l.push(`<span class="t-num">${a(i,t,h)}</span>`);continue}if(c(g)){const g=h;for(;h<f&&p(i[h]);)h++;
const m=i.substring(g,h);
let d=h;for(;d<f&&" "===i[d];)d++;t.has(m)?l.push(`<span class="t-kw">${m}</span>`):n.has(m)?l.push(`<span class="t-lit">${m}</span>`):s.has(m)?l.push(`<span class="t-bi">${m}</span>`):"("===i[d]?l.push(`<span class="t-fn">${m}</span>`):g>0&&"."===i[g-1]?l.push(`<span class="t-prop">${m}</span>`):l.push(m);continue}l.push(e(g)),h++}return l.join("")}
function a(t,n,s){let i="";for(let l=n;l<s;l++)i+=e(t[l]);return i}
function r(t){return t>="0"&&t<="9"}
function o(t){return r(t)||t>="a"&&t<="f"||t>="A"&&t<="F"}
function c(t){return t>="a"&&t<="z"||t>="A"&&t<="Z"||"_"===t||"$"===t}
function p(t){return c(t)||r(t)}
function u(t){return'<span class="t-jd">'+t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/(@\w+)/g,'<span class="t-jd-tag">$1</span>').replace(/\{([^}]+)\}/g,'<span class="t-jd-type">{$1}</span>')+"</span>"}

/**
 * Highlight template literal content with inner HTML/CSS syntax.
 * Detects whether the content is HTML-like or CSS-like and applies
 * appropriate token coloring for tags, attributes, properties, values, etc.
 * Falls back to plain string coloring if content is neither.
 */
function highlightTemplateLiteral(raw) {
  const inner = raw.slice(1, -1); // strip backticks
  const escaped = inner.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const hasHtmlTags = /<[a-zA-Z]/.test(inner);
  const hasCssProps = /[{;]\s*[\w-]+\s*:/.test(inner) || /^\s*[\w.#&:\[\]>~+*-]+\s*\{/m.test(inner);

  let highlighted;
  if (hasHtmlTags) {
    highlighted = highlightTemplateHtml(escaped);
  } else if (hasCssProps) {
    highlighted = highlightTemplateCss(escaped);
  } else {
    // Fallback: plain string with ${} interpolation highlighting
    highlighted = escaped.replace(/\$\{([^}]*)\}/g, '<span class="t-tl-interp">${$1}</span>');
  }

  return '<span class="t-tl">`' + highlighted + '`</span>';
}

/** Highlight HTML content inside a template literal */
function highlightTemplateHtml(html) {
  return html
    // ${...} interpolations
    .replace(/\$\{([^}]*)\}/g, '<span class="t-tl-interp">${$1}</span>')
    // HTML tags with attributes
    .replace(/(&lt;\/?)([\w-]*)((?:\s+[^&]*?)?)(\/?\s*&gt;)/g, (_, open, tag, attrs, close) => {
      let attrHtml = attrs;
      if (attrs) {
        // Highlight attribute names and values
        attrHtml = attrs
          .replace(/([\w-]+)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|"[^"]*"|'[^']*')/g,
            '<span class="t-tl-attr">$1</span>$2<span class="t-str">$3</span>')
          .replace(/\s([\w-]+)(?=[\s\/&]|$)/g, ' <span class="t-tl-attr">$1</span>');
      }
      return `<span class="t-tl-bracket">${open}</span><span class="t-tl-tag">${tag}</span>${attrHtml}<span class="t-tl-bracket">${close}</span>`;
    })
    // HTML comments
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="t-cm">$1</span>');
}

/** Highlight CSS content inside a template literal */
function highlightTemplateCss(css) {
  return css
    // ${...} interpolations
    .replace(/\$\{([^}]*)\}/g, '<span class="t-tl-interp">${$1}</span>')
    // CSS comments
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="t-cm">$1</span>')
    // CSS selectors (lines ending with {)
    .replace(/^(\s*)([\w.#&:\[\]>~+*\s,-]+?)(\s*\{)/gm, '$1<span class="t-tl-sel">$2</span>$3')
    // CSS property: value pairs
    .replace(/([\w-]+)(\s*:\s*)([^;{}]+)(;)/g,
      '<span class="t-tl-prop">$1</span>$2<span class="t-tl-val">$3</span>$4')
    // CSS @-rules
    .replace(/@([\w-]+)/g, '<span class="t-kw">@$1</span>');
}

/** Markdown → HTML renderer */
export function renderMarkdown(src, basePath) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = src.split('\n');
  const out = [];
  let inCode = false, codeLang = '', codeLines = [];
  let inList = false, listType = '';
  let paragraph = [];

  function flushP() {
    if (paragraph.length > 0) {
      out.push(`<p class="md-p">${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
  }

  function closeList() {
    flushP();
    if (inList) { out.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Fenced code blocks
    if (raw.trimStart().startsWith('```')) {
      flushP();
      if (inCode) {
        out.push(`<pre class="md-code-block"><code>${esc(codeLines.join('\n'))}</code></pre>`);
        inCode = false; codeLines = [];
      } else {
        closeList();
        inCode = true;
        codeLang = raw.trim().slice(3).trim();
        codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    const trimmed = raw.trim();
    if (!trimmed) { flushP(); closeList(); continue; }

    // Headings
    const hm = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      flushP();
      closeList();
      const level = hm[1].length;
      out.push(`<h${level} class="md-h">${inline(hm[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      flushP();
      closeList();
      out.push('<hr class="md-hr">');
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushP();
      closeList();
      out.push(`<blockquote class="md-quote">${inline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulm = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulm) {
      flushP();
      if (!inList || listType !== 'ul') { closeList(); out.push('<ul class="md-list">'); inList = true; listType = 'ul'; }
      out.push(`<li>${inline(ulm[1])}</li>`);
      continue;
    }

    // Ordered list
    const olm = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (olm) {
      flushP();
      if (!inList || listType !== 'ol') { closeList(); out.push('<ol class="md-list">'); inList = true; listType = 'ol'; }
      out.push(`<li>${inline(olm[1])}</li>`);
      continue;
    }

    // Table detection
    if (trimmed.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i+1].trim())) {
      flushP();
      closeList();
      const headers = trimmed.split('|').map(c => c.trim()).filter(Boolean);
      i++; // skip separator
      out.push('<table class="md-table"><thead><tr>');
      headers.forEach(h => out.push(`<th>${inline(h)}</th>`));
      out.push('</tr></thead><tbody>');
      while (i + 1 < lines.length && lines[i+1].trim().includes('|')) {
        i++;
        const cells = lines[i].trim().split('|').map(c => c.trim()).filter(Boolean);
        out.push('<tr>');
        cells.forEach(c => out.push(`<td>${inline(c)}</td>`));
        out.push('</tr>');
      }
      out.push('</tbody></table>');
      continue;
    }

    // Paragraph
    paragraph.push(trimmed);
  }

  flushP();
  // Close any open code block
  if (inCode) {
    out.push(`<pre class="md-code-block"><code>${esc(codeLines.join('\n'))}</code></pre>`);
  }
  closeList();

  return out.join('\n');

  function inline(text) {
    return esc(text)
      // Images: ![alt](src)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        const resolved = resolveImagePath(src, basePath);
        return `<img class="md-img" src="${resolved}" alt="${alt}" loading="lazy">`;
      })
      // Links: [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank">$1</a>')
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // Inline code: `code`
      .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
      // Strikethrough: ~~text~~
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
  }

  function resolveImagePath(src, base) {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
    // Relative path → /api/raw-file
    const dir = base ? base.substring(0, base.lastIndexOf('/') + 1) : '';
    const full = dir + src;
    return `/api/image?path=${encodeURIComponent(full)}`;
  }
}

/** SQL highlighter */
export function highlightSQL(src) {
  const kw = new Set(['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','ALTER','DROP','TABLE','INDEX','IF','NOT','EXISTS','PRIMARY','KEY','REFERENCES','DEFAULT','NULL','ON','AND','OR','IN','AS','JOIN','LEFT','RIGHT','INNER','OUTER','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','UNION','ALL','DISTINCT','CASE','WHEN','THEN','ELSE','END','CASCADE','SERIAL','CONSTRAINT','UNIQUE','CHECK','FOREIGN','INTEGER','INT','VARCHAR','TEXT','BOOLEAN','TIMESTAMP','JSONB','JSON','BIGINT','SMALLINT','NUMERIC','FLOAT','DOUBLE','DECIMAL','DATE','TIME','NOW','WITH','RECURSIVE','RETURNING']);
  return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/--.*/g, m => `<span class="t-cm">${m}</span>`)
    .replace(/'[^']*'/g, m => `<span class="t-str">${m}</span>`)
    .replace(/\b\d+\b/g, m => `<span class="t-num">${m}</span>`)
    .replace(/\b[A-Z_]{2,}\b/g, m => kw.has(m) ? `<span class="t-kw">${m}</span>` : m);
}

/** JSON highlighter */
export function highlightJSON(src) {
  return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // Strings (keys and values)
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="t-tl-prop">$1</span>:')
    .replace(/:(\s*)("(?:[^"\\]|\\.)*")/g, ':$1<span class="t-str">$2</span>')
    // Remaining standalone strings (in arrays etc.)
    .replace(/(?<=[\[,\s])("(?:[^"\\]|\\.)*")(?=[\],\s])/g, '<span class="t-str">$1</span>')
    // Numbers
    .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g, (m, n) => m.replace(n, `<span class="t-num">${n}</span>`))
    // Booleans and null
    .replace(/\b(true|false|null)\b/g, '<span class="t-lit">$1</span>');
}

/** CSS highlighter */
export function highlightCSS(src) {
  let html = src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Extract comments and strings as placeholders to avoid regex conflicts
  const placeholders = [];
  const ph = (s) => { placeholders.push(s); return `\x00PH${placeholders.length - 1}\x00`; };
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, (m) => ph(`<span class="t-cm">${m}</span>`));
  html = html.replace(/(["'])(?:(?!\1).)*?\1/g, (m) => ph(`<span class="t-str">${m}</span>`));
  // @-rules
  html = html.replace(/@([\w-]+)/g, '<span class="t-kw">@$1</span>');
  // Selectors (lines ending with {)
  html = html.replace(/^(\s*)([\w.#&:\[\]>~+*\s,-]+?)(\s*\{)/gm, '$1<span class="t-tl-sel">$2</span>$3');
  // Property: value pairs
  html = html.replace(/([\w-]+)(\s*:\s*)([^;{}]+)(;)/g,
    '<span class="t-tl-prop">$1</span>$2<span class="t-tl-val">$3</span>$4');
  // Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[i]);
  return html;
}

/** HTML/XML highlighter */
export function highlightHTML(src) {
  return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // Comments
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="t-cm">$1</span>')
    // DOCTYPE / processing instructions
    .replace(/(&lt;![A-Z]+[^&]*?&gt;)/g, '<span class="t-cm">$1</span>')
    // Tags with attributes
    .replace(/(&lt;\/?)(\w[\w-]*)((?:\s+[^&]*?)?)(\/?\s*&gt;)/g, (_, open, tag, attrs, close) => {
      let attrHtml = attrs;
      if (attrs) {
        attrHtml = attrs
          .replace(/([\w-]+)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|"[^"]*"|'[^']*')/g,
            '<span class="t-tl-attr">$1</span>$2<span class="t-str">$3</span>')
          .replace(/\s([\w-]+)(?=[\s\/&]|$)/g, ' <span class="t-tl-attr">$1</span>');
      }
      return `<span class="t-tl-bracket">${open}</span><span class="t-tl-tag">${tag}</span>${attrHtml}<span class="t-tl-bracket">${close}</span>`;
    })
    // Entities
    .replace(/(&amp;\w+;)/g, '<span class="t-num">$1</span>');
}

/** YAML highlighter */
export function highlightYAML(src) {
  let html = src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const placeholders = [];
  const ph = (s) => { placeholders.push(s); return `\x00PH${placeholders.length - 1}\x00`; };
  // Comments
  html = html.replace(/(#.*)/g, (m) => ph(`<span class="t-cm">${m}</span>`));
  // Quoted strings
  html = html.replace(/(["'])(?:(?!\1).)*?\1/g, (m) => ph(`<span class="t-str">${m}</span>`));
  // Keys (word: )
  html = html.replace(/^(\s*)([\w][\w.-]*)(\s*:)/gm, '$1<span class="t-tl-prop">$2</span>$3');
  // Booleans and null
  html = html.replace(/:\s*(true|false|null|yes|no|on|off)\b/gi, (m, v) => m.replace(v, `<span class="t-lit">${v}</span>`));
  // Numbers
  html = html.replace(/:\s*(-?\d+\.?\d*)\b/g, (m, n) => m.replace(n, `<span class="t-num">${n}</span>`));
  // Anchors and aliases
  html = html.replace(/([&*]\w+)/g, '<span class="t-fn">$1</span>');
  // Document markers
  html = html.replace(/^(---|\.\.\.)\s*$/gm, '<span class="t-kw">$1</span>');
  // Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[i]);
  return html;
}

/** Shell/Bash highlighter */
export function highlightShell(src) {
  const kw = new Set(['if','then','else','elif','fi','for','while','do','done','case','esac','in','function','return','exit','export','local','readonly','declare','source','alias','unalias','set','unset','shift','trap','eval','exec','test']);
  let html = src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const placeholders = [];
  const ph = (s) => { placeholders.push(s); return `\x00PH${placeholders.length - 1}\x00`; };
  // Comments
  html = html.replace(/(#.*)/g, (m) => ph(`<span class="t-cm">${m}</span>`));
  // Double-quoted strings
  html = html.replace(/"(?:[^"\\]|\\.)*"/g, (m) => ph(`<span class="t-str">${m}</span>`));
  // Single-quoted strings
  html = html.replace(/'[^']*'/g, (m) => ph(`<span class="t-str">${m}</span>`));
  // Variables
  html = html.replace(/(\$\{?\w+\}?)/g, '<span class="t-fn">$1</span>');
  // Numbers
  html = html.replace(/\b(\d+)\b/g, '<span class="t-num">$1</span>');
  // Keywords
  html = html.replace(/\b(\w+)\b/g, (m, w) => kw.has(w) ? `<span class="t-kw">${w}</span>` : m);
  // Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[i]);
  return html;
}

/** INI/ENV/CONF/TOML highlighter */
export function highlightINI(src) {
  let html = src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const placeholders = [];
  const ph = (s) => { placeholders.push(s); return `\x00PH${placeholders.length - 1}\x00`; };
  // Comments
  html = html.replace(/(#.*|;.*)/g, (m) => ph(`<span class="t-cm">${m}</span>`));
  // Quoted values
  html = html.replace(/(["'])(?:(?!\1).)*?\1/g, (m) => ph(`<span class="t-str">${m}</span>`));
  // Section headers [section]
  html = html.replace(/^(\s*\[[\w. -]+\]\s*)$/gm, '<span class="t-kw">$1</span>');
  // Key=value
  html = html.replace(/^(\s*)([\w][\w.-]*)(\s*=\s*)(.*)/gm, (_, indent, key, eq, val) => {
    let vHtml = val;
    if (/^\x00PH/.test(val)) vHtml = val; // already a placeholder
    else if (/^(true|false|yes|no|on|off)$/i.test(val)) vHtml = `<span class="t-lit">${val}</span>`;
    else if (/^-?\d+\.?\d*$/.test(val)) vHtml = `<span class="t-num">${val}</span>`;
    else vHtml = `<span class="t-tl-val">${val}</span>`;
    return `${indent}<span class="t-tl-prop">${key}</span>${eq}${vHtml}`;
  });
  // Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[i]);
  return html;
}

/** Language keyword/builtin/literal definitions for the universal highlighter */
const LANG_DEFS = {
  python: {
    kw: new Set(['and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield']),
    bi: new Set(['print','len','range','type','int','str','float','list','dict','tuple','set','bool','None','True','False','super','self','open','map','filter','zip','enumerate','sorted','reversed','isinstance','issubclass','hasattr','getattr','setattr','input','abs','max','min','sum','round','any','all','iter','next','format','repr','id','hash','dir','vars','globals','locals','staticmethod','classmethod','property']),
    lit: new Set(['True','False','None']),
    hashComment: true, tripleStr: true,
  },
  ruby: {
    kw: new Set(['alias','and','begin','break','case','class','def','defined?','do','else','elsif','end','ensure','for','if','in','module','next','nil','not','or','redo','rescue','retry','return','self','super','then','undef','unless','until','when','while','yield','require','include','extend','attr_accessor','attr_reader','attr_writer','raise','puts','print']),
    bi: new Set(['Array','Hash','String','Integer','Float','Symbol','Proc','Lambda','IO','File','Dir','Regexp','Range','Enumerable','Comparable','Kernel','Object','Class','Module','NilClass','TrueClass','FalseClass']),
    lit: new Set(['true','false','nil']),
    hashComment: true,
  },
  go: {
    kw: new Set(['break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var']),
    bi: new Set(['append','cap','close','complex','copy','delete','imag','len','make','new','panic','print','println','real','recover','error','string','bool','byte','rune','int','int8','int16','int32','int64','uint','uint8','uint16','uint32','uint64','float32','float64','complex64','complex128','uintptr','fmt','os','io','net','http','context','sync','time','strings','strconv','errors','log']),
    lit: new Set(['true','false','nil','iota']),
  },
  rust: {
    kw: new Set(['as','async','await','break','const','continue','crate','dyn','else','enum','extern','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','Self','static','struct','super','trait','type','unsafe','use','where','while','macro_rules']),
    bi: new Set(['Vec','String','Option','Result','Box','Rc','Arc','Cell','RefCell','HashMap','HashSet','BTreeMap','BTreeSet','Iterator','IntoIterator','From','Into','Display','Debug','Clone','Copy','Default','Eq','PartialEq','Ord','PartialOrd','Hash','Send','Sync','Sized','Drop','Fn','FnMut','FnOnce','Some','None','Ok','Err','println','eprintln','format','write','writeln','todo','unimplemented','unreachable','assert','assert_eq','assert_ne','dbg','vec','panic']),
    lit: new Set(['true','false']),
  },
  java: {
    kw: new Set(['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while','var','record','sealed','permits','yield']),
    bi: new Set(['System','String','Integer','Long','Double','Float','Boolean','Character','Byte','Short','Object','Class','Math','Arrays','Collections','List','ArrayList','Map','HashMap','Set','HashSet','Queue','Stack','Optional','Stream','Thread','Runnable','Exception','RuntimeException','IOException','StringBuilder','Scanner','File','Path','Paths','Files']),
    lit: new Set(['true','false','null']),
  },
  kotlin: {
    kw: new Set(['abstract','annotation','as','break','by','catch','class','companion','const','constructor','continue','crossinline','data','do','else','enum','external','final','finally','for','fun','get','if','import','in','infix','init','inline','inner','interface','internal','is','lateinit','noinline','object','open','operator','out','override','package','private','protected','public','reified','return','sealed','set','super','suspend','tailrec','this','throw','try','typealias','val','var','vararg','when','where','while']),
    bi: new Set(['Any','Boolean','Byte','Char','Double','Float','Int','Long','Nothing','Short','String','Unit','Array','List','Map','Set','MutableList','MutableMap','MutableSet','Pair','Triple','Sequence','Comparable','Iterable','println','print','readLine','listOf','mapOf','setOf','arrayOf','mutableListOf','mutableMapOf','mutableSetOf']),
    lit: new Set(['true','false','null']),
  },
  swift: {
    kw: new Set(['associatedtype','break','case','catch','class','continue','default','defer','deinit','do','else','enum','extension','fallthrough','fileprivate','for','func','guard','if','import','in','init','inout','internal','is','let','open','operator','private','protocol','public','repeat','rethrows','return','self','Self','static','struct','subscript','super','switch','throw','throws','try','typealias','var','where','while','async','await','actor']),
    bi: new Set(['Array','Bool','Character','Dictionary','Double','Float','Int','Optional','Set','String','UInt','Any','AnyObject','Error','Codable','Decodable','Encodable','Equatable','Hashable','Comparable','CustomStringConvertible','DispatchQueue','URLSession','Data','URL','print','debugPrint','fatalError','precondition','assert']),
    lit: new Set(['true','false','nil']),
  },
  c: {
    kw: new Set(['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','_Alignas','_Alignof','_Atomic','_Bool','_Complex','_Generic','_Imaginary','_Noreturn','_Static_assert','_Thread_local','#include','#define','#ifdef','#ifndef','#endif','#if','#else','#elif','#pragma','#error','#undef']),
    bi: new Set(['printf','scanf','malloc','calloc','realloc','free','memcpy','memset','memmove','strcmp','strlen','strcpy','strcat','strncpy','strncat','fprintf','sprintf','snprintf','fopen','fclose','fread','fwrite','fgets','fputs','stdin','stdout','stderr','NULL','EOF','size_t','ptrdiff_t','FILE','EXIT_SUCCESS','EXIT_FAILURE','assert','abort','exit']),
    lit: new Set(['true','false','NULL','TRUE','FALSE']),
  },
  csharp: {
    kw: new Set(['abstract','as','base','bool','break','byte','case','catch','char','checked','class','const','continue','decimal','default','delegate','do','double','else','enum','event','explicit','extern','finally','fixed','float','for','foreach','goto','if','implicit','in','int','interface','internal','is','lock','long','namespace','new','object','operator','out','override','params','private','protected','public','readonly','ref','return','sbyte','sealed','short','sizeof','stackalloc','static','string','struct','switch','this','throw','try','typeof','uint','ulong','unchecked','unsafe','ushort','using','var','virtual','void','volatile','while','async','await','dynamic','nameof','record','init','required','yield']),
    bi: new Set(['Console','String','Int32','Boolean','Object','Array','List','Dictionary','Task','Action','Func','Exception','DateTime','TimeSpan','Math','File','Path','Directory','Stream','StringBuilder','Enumerable','Linq','IEnumerable','IList','IDictionary','IDisposable','EventHandler','Attribute','Type','Convert','Guid','Nullable','Tuple','ValueTuple']),
    lit: new Set(['true','false','null']),
  },
  php: {
    kw: new Set(['abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','eval','extends','final','finally','fn','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','insteadof','interface','isset','list','match','namespace','new','or','print','private','protected','public','readonly','require','require_once','return','static','switch','throw','trait','try','unset','use','var','while','xor','yield','from']),
    bi: new Set(['array_map','array_filter','array_push','array_pop','array_shift','array_merge','array_keys','array_values','count','strlen','strpos','substr','str_replace','explode','implode','trim','strtolower','strtoupper','is_array','is_string','is_int','is_null','isset','empty','var_dump','print_r','json_encode','json_decode','date','time','file_get_contents','file_put_contents','preg_match','preg_replace','sprintf','intval','floatval','boolval']),
    lit: new Set(['true','false','null','TRUE','FALSE','NULL']),
    hashComment: true,
  },
  dart: {
    kw: new Set(['abstract','as','assert','async','await','break','case','catch','class','const','continue','covariant','default','deferred','do','dynamic','else','enum','export','extends','extension','external','factory','final','finally','for','Function','get','hide','if','implements','import','in','interface','is','late','library','mixin','new','on','operator','part','required','rethrow','return','set','show','static','super','switch','sync','this','throw','try','typedef','var','void','while','with','yield']),
    bi: new Set(['print','int','double','String','bool','List','Map','Set','Future','Stream','Duration','DateTime','RegExp','Object','Type','Iterable','Iterator','Null','Symbol','Function','dynamic','num','Comparable','Pattern','StringBuffer','Uri','Error','Exception','StateError','ArgumentError','RangeError','TypeError','FormatException']),
    lit: new Set(['true','false','null']),
  },
  lua: {
    kw: new Set(['and','break','do','else','elseif','end','for','function','goto','if','in','local','not','or','repeat','return','then','until','while']),
    bi: new Set(['print','type','tostring','tonumber','error','assert','pcall','xpcall','require','select','pairs','ipairs','next','rawget','rawset','rawequal','setmetatable','getmetatable','unpack','table','string','math','io','os','coroutine','debug']),
    lit: new Set(['true','false','nil']),
    lineComment: '--', blockCommentOpen: '--[[', blockCommentClose: ']]',
  },
  dockerfile: {
    kw: new Set(['FROM','RUN','CMD','LABEL','MAINTAINER','EXPOSE','ENV','ADD','COPY','ENTRYPOINT','VOLUME','USER','WORKDIR','ARG','ONBUILD','STOPSIGNAL','HEALTHCHECK','SHELL','AS']),
    bi: new Set(['apt-get','apk','yum','npm','pip','curl','wget','chmod','chown','mkdir','rm','cp','mv','cat','echo','bash','sh']),
    lit: new Set(['true','false']),
    hashComment: true,
  },
};

/**
 * Universal C-like syntax highlighter.
 * Works for Python, Go, Rust, Java, C/C++, C#, PHP, Ruby, Kotlin, Swift, Dart, Lua, Dockerfile.
 * Uses the same tokenizer logic as the JS highlighter but with configurable keyword sets.
 * @param {string} src - Source code
 * @param {string} lang - Language key (must exist in LANG_DEFS)
 */
export function highlightLang(src, lang) {
  const def = LANG_DEFS[lang];
  if (!def) return highlightPlain(src);
  const { kw, bi, lit, hashComment, tripleStr, lineComment, blockCommentOpen, blockCommentClose } = def;
  const lc = lineComment || '//';
  const bco = blockCommentOpen || '/*';
  const bcc = blockCommentClose || '*/';
  const out = [];
  const len = src.length;
  let i = 0;
  while (i < len) {
    const ch = src[i];
    // Line comments (// or # or --)
    if ((hashComment && ch === '#') ||
        (src.substring(i, i + lc.length) === lc && !hashComment)) {
      const s = i;
      while (i < len && src[i] !== '\n') i++;
      out.push(`<span class="t-cm">${esc(src, s, i)}</span>`);
      continue;
    }
    // Block comments (/* */ or --[[ ]])
    if (src.substring(i, i + bco.length) === bco) {
      const s = i;
      i += bco.length;
      while (i < len && src.substring(i, i + bcc.length) !== bcc) i++;
      i += bcc.length;
      out.push(`<span class="t-cm">${esc(src, s, i)}</span>`);
      continue;
    }
    // Triple-quoted strings (Python)
    if (tripleStr && (src.substring(i, i+3) === '"""' || src.substring(i, i+3) === "'''")) {
      const q = src.substring(i, i+3);
      const s = i;
      i += 3;
      while (i < len && src.substring(i, i+3) !== q) { if (src[i] === '\\') i++; i++; }
      i += 3;
      out.push(`<span class="t-str">${esc(src, s, i)}</span>`);
      continue;
    }
    // Strings
    if (ch === "'" || ch === '"') {
      const s = i; i++;
      while (i < len && src[i] !== ch) { if (src[i] === '\\') i++; i++; }
      i++;
      out.push(`<span class="t-str">${esc(src, s, i)}</span>`);
      continue;
    }
    // Backtick strings (Go raw strings, etc.)
    if (ch === '`') {
      const s = i; i++;
      while (i < len && src[i] !== '`') i++;
      i++;
      out.push(`<span class="t-str">${esc(src, s, i)}</span>`);
      continue;
    }
    // Numbers
    if (isDigit(ch) || (ch === '.' && i+1 < len && isDigit(src[i+1]))) {
      const s = i;
      if (ch === '0' && (src[i+1] === 'x' || src[i+1] === 'X')) {
        i += 2; while (i < len && isHex(src[i])) i++;
      } else if (ch === '0' && (src[i+1] === 'b' || src[i+1] === 'B')) {
        i += 2; while (i < len && (src[i] === '0' || src[i] === '1')) i++;
      } else if (ch === '0' && (src[i+1] === 'o' || src[i+1] === 'O')) {
        i += 2; while (i < len && src[i] >= '0' && src[i] <= '7') i++;
      } else {
        while (i < len && (isDigit(src[i]) || src[i] === '.' || src[i] === 'e' || src[i] === 'E' || src[i] === '_')) i++;
      }
      // Numeric suffixes (f, u, l, i32, etc.)
      while (i < len && isIdent(src[i])) i++;
      out.push(`<span class="t-num">${esc(src, s, i)}</span>`);
      continue;
    }
    // Identifiers and keywords
    if (isIdentStart(ch)) {
      const s = i;
      while (i < len && isIdent(src[i])) i++;
      const word = src.substring(s, i);
      let d = i; while (d < len && src[d] === ' ') d++;
      if (kw.has(word)) out.push(`<span class="t-kw">${word}</span>`);
      else if (lit.has(word)) out.push(`<span class="t-lit">${word}</span>`);
      else if (bi.has(word)) out.push(`<span class="t-bi">${word}</span>`);
      else if (src[d] === '(') out.push(`<span class="t-fn">${word}</span>`);
      else if (s > 0 && src[s-1] === '.') out.push(`<span class="t-prop">${word}</span>`);
      else out.push(escChar(word));
      continue;
    }
    // PHP variables
    if (ch === '$' && i+1 < len && isIdentStart(src[i+1])) {
      const s = i; i++;
      while (i < len && isIdent(src[i])) i++;
      out.push(`<span class="t-fn">${esc(src, s, i)}</span>`);
      continue;
    }
    // Decorators / Attributes (@)
    if (ch === '@' && i+1 < len && isIdentStart(src[i+1])) {
      const s = i; i++;
      while (i < len && isIdent(src[i])) i++;
      out.push(`<span class="t-jd-tag">${esc(src, s, i)}</span>`);
      continue;
    }
    out.push(escSingle(ch));
    i++;
  }
  return out.join('');
}

function esc(src, from, to) { let r = ''; for (let i = from; i < to; i++) r += escSingle(src[i]); return r; }
function escSingle(ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch; }
function escChar(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isDigit(ch) { return ch >= '0' && ch <= '9'; }
function isHex(ch) { return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'); }
function isIdentStart(ch) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$'; }
function isIdent(ch) { return isIdentStart(ch) || isDigit(ch); }

/** Generic plain-text highlighter (no colors, just escape) */
export function highlightPlain(src) {
  return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}