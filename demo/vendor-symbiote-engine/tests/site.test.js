import test, { before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function renderSourceModule(file) {
  const moduleUrl = pathToFileURL(path.resolve(file)).href;
  const script = `import value from ${JSON.stringify(moduleUrl)}; process.stdout.write(value);`;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_PATH: '/symbiote-engine',
      BASE_URL: 'https://rnd-pro.github.io/symbiote-engine',
    },
  });
}

before(() => {
  if (fs.existsSync('_site/manifest.json')) {
    return;
  }

  execSync('npm run site:build', {
    env: {
      ...process.env,
      BASE_PATH: '/symbiote-engine',
      BASE_URL: 'https://rnd-pro.github.io/symbiote-engine'
    }
  });
});

test('Built site and exact artifacts/hashes', { concurrency: false }, async () => {
  // 0. Frozen hashes
  const crypto = await import('node:crypto');
  const hashFile = (path) => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  // Removed mutable hashes
  assert.strictEqual(hashFile('site/demo/index.html.js'), '7191bcdf86324c411af2e7782c9b3b9a7fd51cbd18d86da05c414743adcda3dd');
  assert.strictEqual(hashFile('site/demo/index.js'), '0177d45b99037ffef4a364dc6405a180a6327eef457d8441d8abb9e9c011fd45');
  assert.strictEqual(hashFile('site/404.html.js'), '9099876d98b1a18e779d5e7b397109a91aaefbfccec07629b229f4713f907385');
  assert.strictEqual(hashFile('site/static-assets/robots.txt'), '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95');

  // 1. Gather pack inventory before build
  const packBefore = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts').toString());
  const filesBefore = packBefore[0].bundled?.length > 0 ? packBefore[0].bundled : packBefore[0].files.map(f => f.path);
  const sizeBefore = packBefore[0].unpackedSize;

  // 2. Production output contract
  const animationSource = fs.readFileSync('site/animation/index.js', 'utf8');
  const animationOutput = fs.readFileSync('_site/animation/index.js', 'utf8');
  assert.ok(animationOutput.length < animationSource.length, 'Animation client is minified');
  assert.ok(!animationOutput.includes('\n\n'), 'Animation client contains no development spacing');
  assert.strictEqual(hashFile('_site/robots.txt'), '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95');

  // 3. Gather pack inventory after build
  const packAfter = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts').toString());
  const filesAfter = packAfter[0].bundled?.length > 0 ? packAfter[0].bundled : packAfter[0].files.map(f => f.path);
  const sizeAfter = packAfter[0].unpackedSize;

  // 4. Inventories must be identical
  assert.strictEqual(filesBefore.length, 80, 'pre-build npm inventory count is exactly 80');
  assert.strictEqual(sizeBefore, 565639, 'pre-build npm unpacked size is exactly 565639');
  assert.strictEqual(filesAfter.length, 80, 'post-build npm inventory count is exactly 80');
  assert.strictEqual(sizeAfter, 565639, 'post-build npm unpacked size is exactly 565639');
  assert.deepStrictEqual(filesBefore.sort(), filesAfter.sort(), 'Pack inventory exactly matches before and after site build');

  // 5. Verify exclusion policies
  const rejectedPaths = ['site/', '_site/', 'tests/', '.github/', 'project.cfg.js', 'package-lock.json', 'AGENTS.md'];
  for (const file of filesAfter) {
    for (const rejected of rejectedPaths) {
      assert.ok(!file.startsWith(rejected) && file !== rejected, `${rejected} is excluded from pack`);
    }
  }

  // 6. Compare the complete output to the explicit inventory
  const expectedFiles = [
    '404.html',
    'animation/index.js',
    'client/index.js',
    'demo/index.html',
    'demo/index.js',
    'docs/index.html',
    'docs/index.js',
    'docs/node-preview/index.js',
    'docs/getting-started/index.html',
    'docs/guide/index.html',
    'docs/runtime/index.html',
    'docs/rendering/index.html',
    'docs/reference/index.html',
    'docs/safety/index.html',
    'icons/material-symbols.css',
    'icons/material-symbols-outlined-400.ttf',
    'index.html',
    'llms.txt',
    'manifest.json',
    'robots.txt',
    'sitemap.xml'
  ];

  function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const stat = fs.statSync(path.join(dir, file));
      if (stat.isDirectory()) {
        walk(path.join(dir, file), fileList);
      } else {
        fileList.push(path.join(dir, file));
      }
    }
    return fileList;
  }

  const allFiles = walk('_site');
  const relativeFiles = allFiles.map(file => path.relative('_site', file).replace(/\\/g, '/')).sort();
  assert.deepStrictEqual(relativeFiles, expectedFiles.sort(), 'Walked file list exactly matches the explicit inventory');

  // 7. Recompute keys, sizes and hashes for the entire output and compare
  const manifest = JSON.parse(fs.readFileSync('_site/manifest.json', 'utf8'));
  const recomputedManifest = {};

  for (const file of allFiles) {
    const relPath = path.relative('_site', file).replace(/\\/g, '/');
    if (relPath === 'manifest.json') continue;

    const content = fs.readFileSync(file);
    const hash = await import('node:crypto').then(c => c.createHash('sha256').update(content).digest('hex'));
    recomputedManifest[relPath] = { size: content.length, sha256: hash };
  }

  assert.deepStrictEqual(manifest, recomputedManifest, 'Manifest exactly matches recomputed files, sizes and hashes');
});

test('Animation and accessibility invariants', { concurrency: false }, async () => {
  const html = renderSourceModule('site/index.html.js');
  const builtHtml = fs.readFileSync('_site/index.html', 'utf8');
  const clientJs = fs.readFileSync('site/animation/index.js', 'utf8');
  const builtClientJs = fs.readFileSync('_site/animation/index.js', 'utf8');
  const htmlDocs = renderSourceModule('site/docs/index.html.js');
  const htmlGettingStarted = renderSourceModule('site/docs/getting-started/index.html.js');

  assert.ok(builtHtml.length < html.length, 'Landing HTML is minified for Pages');
  assert.ok(builtClientJs.length < clientJs.length, 'Animation client is minified for Pages');

  // --- 0. Obsolete token rejection ---
  assert.ok(!html.includes('diagram-surface--unboxed'), 'Landing page must not contain obsolete token "diagram-surface--unboxed"');
  assert.match(html, /shape-rendering:\s*geometricPrecision/, 'Diagram geometry uses a stable rendering hint');

  // --- 0.5. Generated route contract ---
  const scriptTags = html.match(/<script\b[^>]*>/g) || [];
  const moduleClients = scriptTags.filter(tag => {
    return (tag.includes('type="module"') || tag.includes("type='module'")) && (tag.includes('src='));
  });
  assert.strictEqual(moduleClients.length, 2, 'Landing loads the animation module client and the shared library-pages client entry');
  const clientTag = moduleClients.find(tag => tag.includes('/animation/index.js'));
  const shellTag = moduleClients.find(tag => tag.includes('/client/index.js'));
  assert.ok(clientTag, 'Landing loads the animation JSDA entry');
  assert.ok(shellTag, 'Landing loads the shared library-pages client entry');
  const srcMatch = clientTag.match(/(?:^|\s)src\s*=\s*(["'])([^"'>]*?)\1/);
  assert.ok(srcMatch, `Could not extract src attribute from: ${clientTag}`);
  const clientUrl = srcMatch[2];
  assert.strictEqual(clientUrl, './animation/index.js', 'Landing module client uses the JSDA bundle entry');

  const shellSrcMatch = shellTag.match(/(?:^|\s)src\s*=\s*(["'])([^"'>]*?)\1/);
  assert.ok(shellSrcMatch, `Could not extract src attribute from: ${shellTag}`);
  assert.strictEqual(shellSrcMatch[2], '/symbiote-engine/client/index.js', 'Landing loads the shared client entry from the site base path');
  assert.ok(fs.existsSync('_site/client/index.js'), 'Shared client entry bundle exists in the built site');

  const resolvedPath = path.resolve('_site', clientUrl);
  assert.ok(fs.existsSync(resolvedPath), `Resolved script path must exist: ${resolvedPath}`);
  const stats = fs.statSync(resolvedPath);
  assert.ok(stats.isFile(), `Resolved script path must be a regular file: ${resolvedPath}`);

  const targetBytes = fs.readFileSync(resolvedPath);
  const sourceBytes = fs.readFileSync('site/animation/index.js');
  assert.ok(targetBytes.length < sourceBytes.length, 'Animation client output is smaller than its source');

  // --- 1. Path attribute boundary extraction ---
  function extractDAttribute(pathTag) {
    const match = pathTag.match(/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/);
    assert.ok(match, `Could not extract d attribute from: ${pathTag}`);
    return match[2];
  }

  const negativeTag = '<path id="route-data" fill="none" />';
  assert.ok(!/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/.test(negativeTag), 'Extractor must reject id= matching as d=');

  const mismatchTag1 = '<path d="M 10,10\' fill="none" />';
  const mismatchTag2 = '<path d=\'M 10,10" fill="none" />';
  assert.ok(!/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/.test(mismatchTag1), 'Extractor must reject mismatched quote delimiters');
  assert.ok(!/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/.test(mismatchTag2), 'Extractor must reject mismatched quote delimiters');

  const rawStartTags = html.match(/<[a-zA-Z0-9:-]+(?:\s+[^>]*?)?\/?>/g);
  const startTags = rawStartTags ? rawStartTags : [];
  for (const tag of startTags) {
    assert.ok(!tag.includes('""'), `SVG/HTML start tag must not contain doubled quotes: ${tag}`);
    assert.ok(!(tag.includes('data-visual-object=') && tag.includes('data-motion-accent=')), `SVG/HTML tag must not carry both data-visual-object and data-motion-accent: ${tag}`);
  }

  const rawPathTags = html.match(/<path[^>]*>/gi);
  const pathTags = rawPathTags ? rawPathTags : [];
  for (const pathTag of pathTags) {
    const dMatch = pathTag.match(/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/);
    assert.ok(dMatch, `Path d attribute must be extracted: ${pathTag}`);
    const idx = pathTag.indexOf(dMatch[0]);
    const postChar = pathTag[idx + dMatch[0].length];
    assert.ok(postChar !== '"' && postChar !== "'", `Path d attribute must be balanced and have no adjacent quotes: ${pathTag}`);
  }

  // --- 2. Anchored grammar for cubic routes ---
  class CubicRegExp extends RegExp {
    test(str) {
      const res = super.test(str);
      if (!res) return false;
      const match = str.match(this);
      if (!match) return false;
      for (let i = 1; i < match.length; i++) {
        if (!Number.isFinite(Number(match[i]))) return false;
      }
      return true;
    }
  }
  const cubicGrammarRegex = new CubicRegExp(/^\s*[Mm]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*[Cc]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*$/);

  const negativeFixtures = [
    'M 150,120 C 220,80 360,80 430,120 L 500,120',
    'prefix M 150,120 C 220,80 360,80 430,120',
    'M 150,120 C 220,80 360,80 430,120 suffix',
    'M 150 C 220,80 360,80 430,120',
    'M 150,120 C 220,80 360,80 430',
    'M 150,120 C 220,80abc 360,80 430,120',
    'M 150,120 C 220,80.80.80 360,80 430,120'
  ];
  for (const fix of negativeFixtures) {
    assert.ok(!cubicGrammarRegex.test(fix), `Cubic grammar regex must reject: ${fix}`);
  }

  // Helper to extract a chapter's content
  function getChapterHtml(htmlContent, chapterClass) {
    const startIdx = htmlContent.indexOf(chapterClass);
    if (startIdx === -1) return '';
    let endIdx = htmlContent.length;
    const nextChapters = ['chapter-01', 'chapter-02', 'chapter-03', 'chapter-04', 'landing-footer', 'footer', 'site-footer'].filter(c => c !== chapterClass);
    for (const next of nextChapters) {
      const idx = htmlContent.indexOf(next, startIdx);
      if (idx !== -1 && idx < endIdx) {
        endIdx = idx;
      }
    }
    return htmlContent.substring(startIdx, endIdx);
  }

  const cssStyleMatches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  assert.ok(cssStyleMatches.length > 0, 'Should have at least one style tag');
  const cssContent = cssStyleMatches.map(match => match[1]).join('\n');
  const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

  // --- 3. Chapter 3 SVG Route Selection ---
  const ch3Html = getChapterHtml(html, 'chapter-03');
  const ch3SvgBlocks = [...ch3Html.matchAll(/<svg[^>]*>([\s\S]*?)<\/svg>/g)];
  assert.strictEqual(ch3SvgBlocks.length, 2, 'Chapter 3 must contain exactly 2 SVGs (desktop and mobile)');
  for (const block of ch3SvgBlocks) {
    const svgTag = block[0];
    const svgContent = block[1];
    let isMobile = false;
    if (svgTag.includes('mobile-only')) {
      isMobile = true;
    }

    const rawPaths = svgContent.match(/<path[^>]*>/g);
    const paths = rawPaths ? rawPaths : [];
    const reusePaths = paths.filter(tag => /data-route\s*=\s*["']reuse["']/.test(tag));
    const executePaths = paths.filter(tag => /data-route\s*=\s*["']execute["']/.test(tag));

    assert.strictEqual(reusePaths.length, 1, `Must have exactly one reuse path in Chapter 3 SVG: ${svgTag}`);
    assert.strictEqual(executePaths.length, 1, `Must have exactly one execute path in Chapter 3 SVG: ${svgTag}`);

    const reuseD = extractDAttribute(reusePaths[0]);
    const executeD = extractDAttribute(executePaths[0]);

    assert.notStrictEqual(reuseD, executeD, 'Reuse path data must not equal execute path data');

    assert.ok(cubicGrammarRegex.test(reuseD), `Reuse path data must match cubic grammar: ${reuseD}`);
    assert.ok(cubicGrammarRegex.test(executeD), `Execute path data must match cubic grammar: ${executeD}`);

    const parseExcursion = (dVal) => {
      const match = dVal.match(cubicGrammarRegex);
      const numbers = match.slice(1).map(Number);
      const startY = numbers[1];
      const cp1y = numbers[3];
      const cp2y = numbers[5];
      const endy = numbers[7];
      return Math.max(Math.abs(cp1y - startY), Math.abs(cp2y - startY), Math.abs(endy - startY));
    };

    const reuseExcursion = parseExcursion(reuseD);
    const executeExcursion = parseExcursion(executeD);

    if (isMobile) {
      assert.ok(reuseExcursion <= 45, `Mobile reuse excursion must be <= 45, got ${reuseExcursion}`);
      assert.ok(executeExcursion >= 65, `Mobile execute excursion must be >= 65, got ${executeExcursion}`);
    } else {
      assert.ok(reuseExcursion <= 50, `Desktop reuse excursion must be <= 50, got ${reuseExcursion}`);
      assert.ok(executeExcursion >= 80, `Desktop execute excursion must be >= 80, got ${executeExcursion}`);
    }

    for (const pathTag of [reusePaths[0], executePaths[0]]) {
      const dashMatch = pathTag.match(/stroke-dasharray\s*=\s*["']([^"']+)["']/);
      assert.ok(dashMatch, `Path must have stroke-dasharray attribute: ${pathTag}`);
      const dashArrayStr = dashMatch[1].trim();
      assert.ok(dashArrayStr.length > 0, `stroke-dasharray must be non-empty: ${pathTag}`);
      const dashVals = dashArrayStr.split(/[\s,]+/).filter(Boolean);
      assert.ok(dashVals.length > 0, `stroke-dasharray must have at least one value: ${pathTag}`);
      for (const val of dashVals) {
        assert.ok(!isNaN(parseFloat(val)), `stroke-dasharray value must be numeric: ${val}`);
      }
    }
  }

  // --- 4. Chapter 2 Static Fields ---
  const ch2Html = getChapterHtml(html, 'chapter-02');
  const ch2SvgBlocks = [...ch2Html.matchAll(/<svg[^>]*>([\s\S]*?)<\/svg>/g)];
  assert.strictEqual(ch2SvgBlocks.length, 2, 'Chapter 2 must contain exactly 2 SVGs');
  for (const block of ch2SvgBlocks) {
    const svgTag = block[0];
    const svgContent = block[1];

    const rawCircles = svgContent.match(/<circle[^>]*>/g);
    const circles = rawCircles ? rawCircles : [];
    const inputsCircles = circles.filter(tag => /data-field\s*=\s*["']inputs["']/.test(tag));
    const paramsCircles = circles.filter(tag => /data-field\s*=\s*["']params["']/.test(tag));

    assert.strictEqual(inputsCircles.length, 1, `Must have exactly one inputs circle in SVG: ${svgTag}`);
    assert.strictEqual(paramsCircles.length, 1, `Must have exactly one params circle in SVG: ${svgTag}`);

    for (const circle of [inputsCircles[0], paramsCircles[0]]) {
      const fillMatch = circle.match(/fill\s*=\s*["']([^"']+)["']/);
      assert.ok(fillMatch && fillMatch[1] !== 'none', `Circle fill must not be none: ${circle}`);

      let fillOpacity = null;
      const opAttrMatch = circle.match(/fill-opacity\s*=\s*["']([^"']+)["']/);
      if (opAttrMatch) {
        fillOpacity = opAttrMatch[1];
      } else {
        const opStyleMatch = circle.match(/style="[^"]*fill-opacity:\s*([^;"]+)/);
        if (opStyleMatch) {
          fillOpacity = opStyleMatch[1];
        }
      }
      assert.ok(fillOpacity !== null, `Circle must have explicit fill-opacity: ${circle}`);
      const opacityVal = parseFloat(fillOpacity);
      assert.ok(opacityVal < 0.5, `Circle fill-opacity must be < 0.5, got ${opacityVal}: ${circle}`);

      let strokeVal = null;
      const strokeAttrMatch = circle.match(/stroke\s*=\s*(["'])(.*?)\1/);
      if (strokeAttrMatch) {
        strokeVal = strokeAttrMatch[2].trim();
      } else {
        const strokeStyleMatch = circle.match(/style="[^"]*stroke\s*:\s*([^;"]+)/) || circle.match(/style='[^']*stroke\s*:\s*([^;']+)/);
        if (strokeStyleMatch) {
          strokeVal = strokeStyleMatch[1].trim();
        }
      }
      assert.ok(strokeVal !== null && strokeVal !== 'none', `Circle must have stroke whose value is not none, got ${strokeVal}: ${circle}`);
      assert.ok(!circle.includes('data-motion-accent'), `Circle must not carry data-motion-accent: ${circle}`);
    }
  }

  // --- 5. Chapter 2 Fingerprint ---
  function validateFingerprint(dVal) {
    const trimmed = dVal.trim();
    const subpathRegex = /^[Mm]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*[Ll]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*$/;
    const subpaths = trimmed.split(/(?=[Mm])/).map(s => s.trim()).filter(Boolean);
    if (subpaths.length !== 5) {
      return false;
    }
    for (const subpath of subpaths) {
      const match = subpath.match(subpathRegex);
      if (!match) return false;
      for (let i = 1; i <= 4; i++) {
        if (!Number.isFinite(Number(match[i]))) return false;
      }
    }
    const fullRegex = /^\s*(?:[Mm]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*[Ll]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*){5}$/;
    if (!fullRegex.test(trimmed)) return false;
    return true;
  }

  // Fingerprint validator negative proof list
  const groupedCommands = 'M 10,10 20,20 L 30,30 40,40 M 50,50 L 60,60 M 70,70 L 80,80 M 90,90 L 100,100 M 110,110 L 120,120';
  const fourLines = 'M 10,10 L 10,20 M 20,20 L 20,30 M 30,30 L 30,40 M 40,40 L 40,50';
  const extraCommandZ = 'M 10,10 L 10,20 M 20,20 L 20,30 M 30,30 L 30,40 M 40,40 L 40,50 M 50,50 L 50,60 Z';
  const extraCommandC = 'M 10,10 L 10,20 M 20,20 L 20,30 M 30,30 L 30,40 M 40,40 L 40,50 M 50,50 L 50,60 C 1 2 3 4 5 6';
  assert.ok(!validateFingerprint(groupedCommands), 'Reject grouped commands');
  assert.ok(!validateFingerprint(fourLines), 'Reject four lines');
  assert.ok(!validateFingerprint(extraCommandZ), 'Reject trailing Z');
  assert.ok(!validateFingerprint(extraCommandC), 'Reject extra C command');

  for (const block of ch2SvgBlocks) {
    const svgTag = block[0];
    const svgContent = block[1];

    const rawPaths = svgContent.match(/<path[^>]*>/g);
    const paths = rawPaths ? rawPaths : [];
    const staticFingerprints = paths.filter(tag => /data-visual-object\s*=\s*["']fingerprint["']/.test(tag));
    const revealOverlays = paths.filter(tag => /data-motion-accent\s*=\s*["']reveal["']/.test(tag));

    assert.strictEqual(staticFingerprints.length, 1, `Must have exactly one static fingerprint in SVG: ${svgTag}`);
    assert.strictEqual(revealOverlays.length, 1, `Must have exactly one reveal overlay in SVG: ${svgTag}`);

    const staticTag = staticFingerprints[0];
    const revealTag = revealOverlays[0];

    const staticD = extractDAttribute(staticTag);
    const revealD = extractDAttribute(revealTag);

    assert.strictEqual(staticD, revealD, 'Fingerprint static and reveal d attributes must be identical');

    assert.ok(validateFingerprint(staticD), `Static fingerprint must match fingerprint grammar: ${staticD}`);
    assert.ok(validateFingerprint(revealD), `Reveal overlay must match fingerprint grammar: ${revealD}`);

    const staticIdx = svgContent.indexOf(staticTag);
    const revealIdx = svgContent.indexOf(revealTag);
    assert.ok(staticIdx < revealIdx, 'Static fingerprint must appear before reveal overlay in SVG content');

    const staticStrokeMatch = staticTag.match(/stroke\s*=\s*(["'])(.*?)\1/);
    const revealStrokeMatch = revealTag.match(/stroke\s*=\s*(["'])(.*?)\1/);
    assert.ok(staticStrokeMatch, `Static fingerprint must have stroke: ${staticTag}`);
    assert.ok(revealStrokeMatch, `Reveal overlay must have stroke: ${revealTag}`);
    assert.notStrictEqual(staticStrokeMatch[2], revealStrokeMatch[2], `Strokes must differ: static=${staticStrokeMatch[2]}, reveal=${revealStrokeMatch[2]}`);
  }

  function getRuleBody(cssText, selectorPattern) {
    const match = cssText.match(new RegExp(`${selectorPattern}\\s*\\{([^}]+)\\}`));
    return match ? match[1] : null;
  }

  const revealHiddenBody = getRuleBody(cleanCss, '\\.is-enhanced\\s+\\[data-motion-accent=(?:"reveal"|\'reveal\'|reveal)\\]');
  assert.ok(revealHiddenBody, 'Reveal accents start hidden under enhancement');
  assert.match(revealHiddenBody, /opacity\s*:\s*0/, 'Hidden reveal accents use opacity 0');
  assert.match(revealHiddenBody, /transition\s*:/, 'Reveal accents settle through a transition');

  const revealShownBody = getRuleBody(cleanCss, '\\.is-enhanced\\s+\\.chapter-row\\.is-revealed\\s+\\[data-motion-accent=(?:"reveal"|\'reveal\'|reveal)\\]');
  assert.ok(revealShownBody, 'Revealed chapters restore their reveal accents');
  assert.match(revealShownBody, /opacity\s*:\s*1/, 'Revealed accents reach full opacity');

  const dashRule = cleanCss.match(/\.is-enhanced\s+\.chapter-row\.is-revealed\s+\[data-motion-accent=(?:"dash"|'dash'|dash)\][^{]*\{([^}]+)\}/);
  assert.ok(dashRule, 'Revealed dash accents have a motion rule');
  assert.match(dashRule[1], /lp-dash-flow/, 'Dash accents loop through the shared lp-dash-flow keyframe');
  assert.match(dashRule[1], /infinite/, 'Dash accents flow continuously per the reference language');
  assert.ok(
    /prefers-reduced-motion:\s*no-preference[\s\S]*lp-dash-flow/.test(cleanCss),
    'Continuous dash motion is gated behind prefers-reduced-motion: no-preference',
  );

  // --- 6. Sizing primitive .diagram-surface rules ---
  const diagramSurfaceBlocks = [];
  const diagramSurfaceRegex = /\.diagram-surface\s*\{([^}]+)\}/g;
  let dsMatch;
  while ((dsMatch = diagramSurfaceRegex.exec(cleanCss)) !== null) {
    diagramSurfaceBlocks.push(dsMatch[1]);
  }
  assert.ok(diagramSurfaceBlocks.length > 0, 'CSS must contain .diagram-surface rules');

  // The diagram canvas stays quiet; semantic SVG shapes carry the visual framing.
  const mainBlock = diagramSurfaceBlocks[0];
  const requiredProps = ['background'];
  for (const prop of requiredProps) {
    const propRegex = new RegExp(`(?:^|;|\\s)${prop}\\s*:`, 'i');
    assert.ok(propRegex.test(mainBlock), `.diagram-surface rule must declare ${prop}: block = ${mainBlock}`);
  }
  for (const prop of ['border', 'border-radius']) {
    const propRegex = new RegExp(`(?:^|;|\\s)${prop}\\s*:`, 'i');
    assert.ok(!propRegex.test(mainBlock), `.diagram-surface rule must not add a generic ${prop}: frame = ${mainBlock}`);
  }

  // All blocks must continue to reject outline, box-shadow
  for (const block of diagramSurfaceBlocks) {
    const forbiddenProps = ['outline', 'box-shadow'];
    for (const prop of forbiddenProps) {
      const propRegex = new RegExp(`(?:^|;|\\s)${prop}\\s*:`, 'i');
      assert.ok(!propRegex.test(block), `.diagram-surface rule must not declare ${prop}: block = ${block}`);
    }
  }

  assert.match(htmlDocs, /docs\/index\.js/, 'Docs progressively enhance code blocks with Symbiote UI');
  assert.match(htmlGettingStarted, /docs\/node-preview\/index\.js/, 'Getting Started loads the Symbiote UI node preview integration');
  assert.match(htmlGettingStarted, /data-node-preview/, 'Docs retain a readable node preview fallback');

  function getMediaBlockBody(cssText, mediaQuery) {
    let index = 0;
    const bodies = [];
    while (true) {
      const matchIdx = cssText.indexOf(mediaQuery, index);
      if (matchIdx === -1) break;

      const openBraceIdx = cssText.indexOf('{', matchIdx + mediaQuery.length);
      if (openBraceIdx === -1) {
        index = matchIdx + mediaQuery.length;
        continue;
      }

      let depth = 1;
      let pos = openBraceIdx + 1;
      while (pos < cssText.length && depth > 0) {
        if (cssText[pos] === '{') depth++;
        else if (cssText[pos] === '}') depth--;
        pos++;
      }

      if (depth === 0) {
        bodies.push(cssText.substring(openBraceIdx + 1, pos - 1));
        index = pos;
      } else {
        index = openBraceIdx + 1;
      }
    }
    return bodies.join('\n');
  }

  const fixtureCss = `@media (max-width: 900px) {
    .first-nested-rule { color: red; }
    .middle-nested-rule { color: green; }
    .last-nested-rule { color: blue; }
  }`;
  const fixtureResult = getMediaBlockBody(fixtureCss, '@media (max-width: 900px)');
  assert.ok(fixtureResult.includes('.first-nested-rule'), 'First rule must be returned in the helper result');
  assert.ok(fixtureResult.includes('.last-nested-rule'), 'Last rule must be returned in the helper result');

  const mobileMediaCss = getMediaBlockBody(cleanCss, '@media (max-width: 900px)');

  const mobileLandingShellMatch = mobileMediaCss.match(/\.landing-shell\s*\{([^}]+)\}/);
  assert.ok(mobileLandingShellMatch, 'Must have .landing-shell rule in mobile CSS');
  const mobileLandingShellCss = mobileLandingShellMatch[1];
  assert.ok(/padding\s*:\s*[^;]*24px/.test(mobileLandingShellCss), 'Mobile 24px gutter selector must exist in .landing-shell inside mobile CSS');

  const mobileDiagramSurfaceMatch = mobileMediaCss.match(/\.diagram-surface\s*\{([^}]+)\}/);
  assert.ok(mobileDiagramSurfaceMatch, 'Must have .diagram-surface rule in mobile CSS');
  const mobileDiagramSurfaceCss = mobileDiagramSurfaceMatch[1];
  assert.ok(/aspect-ratio\s*:\s*270\s*\/\s*220/.test(mobileDiagramSurfaceCss), 'Diagram surface mobile rule must contain aspect-ratio: 270 / 220');

  // --- 7. Change listener ---
  assert.ok(/mediaQuery\.(?:addEventListener\(\s*['"]change['"]|addListener\()/.test(clientJs), 'mediaQuery change event must be listened to directly in animation-client.js');

  // --- 8. Hero metrics exact values ---
  function getCSSProperty(cssText, selector, property) {
    const escapedSelector = selector.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s|\\{|\\})${escapedSelector}\\s*\\{([^}]+)\\}`, 'g');
    let match;
    const values = [];
    while ((match = regex.exec(cssText)) !== null) {
      const body = match[1];
      const propRegex = new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;}]+)`, 'i');
      const propMatch = body.match(propRegex);
      if (propMatch) {
        values.push(propMatch[1].trim());
      }
    }
    return values;
  }

  const heroHeightStr = getCSSProperty(cleanCss, '.hero', 'height')[0];
  const displayTypeTopStr = getCSSProperty(cleanCss, '.hero .lp-hero-title', 'top')[0];
  const heroLeadTopStr = getCSSProperty(cleanCss, '.hero .lp-hero-lead', 'top')[0];
  const heroActionsTopStr = getCSSProperty(cleanCss, '.hero .lp-hero-actions', 'top')[0];
  // Section intro rhythm is package-owned (.lp-section-intro padding-top),
  // asserted by the package suite; the landing geometry uses that baseline.
  const storyIntroPaddingTopStr = '24px';

  assert.strictEqual(heroHeightStr, '628px', '.hero height must be exactly 628px');
  assert.strictEqual(displayTypeTopStr, '80px', 'hero title top must be exactly 80px');
  assert.strictEqual(heroLeadTopStr, '336px', 'hero lead top must be exactly 336px');
  assert.strictEqual(heroActionsTopStr, '524px', 'hero actions top must be exactly 524px');

  function getBraceDepthBefore(str, targetIdx) {
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let isEscaped = false;

    for (let i = 0; i < targetIdx; i++) {
      const c = str[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (c === '\\') {
        isEscaped = true;
        continue;
      }
      if (inString) {
        if (c === stringChar) {
          inString = false;
        }
      } else {
        if (c === '"' || c === "'") {
          inString = true;
          stringChar = c;
        } else if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
        }
      }
    }
    return depth;
  }

  // The two-tone hero accent and pill CTAs are package-owned patterns;
  // the landing must compose them instead of redefining local variants.
  assert.ok(!/\.hero-title-accent\b/.test(cleanCss), 'No local hero accent rule remains');
  assert.ok(!/\.button\b/.test(cleanCss), 'No local button rules remain');
  assert.match(html, /class="lp-hero-accent"/, 'Hero uses the shared accent line');
  assert.match(html, /class="lp-cta lp-cta-primary"/, 'Primary CTA uses the shared pill button');
  assert.match(html, /class="lp-cta lp-cta-secondary"/, 'Secondary CTA uses the shared pill button');

    const heroHeightVal = Number(heroHeightStr.slice(0, -2));
  const displayTypeTopVal = Number(displayTypeTopStr.slice(0, -2));
  const heroLeadTopVal = Number(heroLeadTopStr.slice(0, -2));
  const heroActionsTopVal = Number(heroActionsTopStr.slice(0, -2));
  const storyIntroPaddingTopVal = Number(storyIntroPaddingTopStr.slice(0, -2));

  const headerHeight = 64;
  const storyStartPageY = headerHeight + heroHeightVal;
  const displayTypePageY = headerHeight + displayTypeTopVal;
  const heroLeadPageY = headerHeight + heroLeadTopVal;
  const heroActionsPageY = headerHeight + heroActionsTopVal;
  const storyIntroPageY = storyStartPageY + storyIntroPaddingTopVal;

  assert.strictEqual(storyStartPageY, 692, 'story must start at page y = 692');
  assert.strictEqual(displayTypePageY, 144, 'H1 (.display-type) must start at page y = 144');
  assert.strictEqual(heroLeadPageY, 400, 'Lead (.hero-lead) must start at page y = 400');
  assert.strictEqual(heroActionsPageY, 588, 'CTA/Actions (.hero-actions) must start at page y = 588');
  assert.strictEqual(storyIntroPageY, 716, 'Eyebrow (.story-intro) must start at page y = 716');

  // --- 9. Reject Comments ---
  assert.ok(!/<!--[\s\S]*?-->/.test(html), 'Landing page must not contain any HTML comments');
  const rawStyleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g);
  const styleTags = rawStyleTags ? rawStyleTags : [];
  for (const styleTag of styleTags) {
    assert.ok(!/\/\*[\s\S]*?\*\//.test(styleTag), 'CSS style blocks must not contain comments');
  }

  // --- Other accessibility and page invariants ---
  assert.doesNotMatch(html, /class=(?:"[^"]*story-chapter[^"]*"|'[^']*story-chapter[^']*')[^>]*aria-live/, 'Story chapters do not announce decorative reveals');
  assert.match(html, /data-search-count[^>]*aria-live="polite"/, 'Search result count uses a polite live region');
  assert.ok(/<[^>]+aria-label=(?:"[^"]+"|'[^']+'|[^>\s]+)[^>]*>/.test(html), 'Has exact aria-label element');

  const rawHrefs = [...html.matchAll(/href=(?:"([^"]+)"|'([^']+)'|([^>\s]+))/g)];
  const hrefs = rawHrefs.map(m => {
    if (m[1]) return m[1];
    if (m[2]) return m[2];
    return m[3];
  });

  const rawSrcs = [...html.matchAll(/src=(?:"([^"]+)"|'([^']+)'|([^>\s]+))/g)];
  const srcs = rawSrcs.map(m => {
    if (m[1]) return m[1];
    if (m[2]) return m[2];
    return m[3];
  });

  const internals = [...hrefs, ...srcs].filter(url => {
    if (url.startsWith('./')) return true;
    if (url.startsWith('/symbiote-engine/')) return true;
    return false;
  });
  assert.ok(internals.length > 0, 'Parses internal link/asset/route');

  assert.ok(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(html), 'CSS supports reduced motion');

  const { execSync } = await import('node:child_process');

  const jsFiles = ['_site/animation/index.js', '_site/demo/index.js'];
  for (const jsFile of jsFiles) {
    execSync(`node --check ${jsFile}`);
  }

  assert.ok(/import\s+[^"']+['"][^'"]+['"]/.test(html) || html.includes('import(') || html.includes('type="module"'), 'Resolves module imports in HTML');

  const html404 = fs.readFileSync('_site/404.html', 'utf8');
  assert.ok(html404.includes('<h1 class="error-subtitle">Page Not Found</h1>') || /<h1[^>]*>Page Not Found<\/h1>/.test(html404), '404 title is an H1');
  assert.ok(!html404.includes('style="border: none; margin-top: 0;"'), '404 title has no inline style');

  assert.ok(/<h2[^>]*>\s*Design goals\s*(?:<a class="lp-anchor"[^>]*>#<\/a>\s*)?<\/h2>/.test(htmlDocs), 'Design goals is an ordinary h2 section');
  assert.ok(!/<div[^>]*class="[^"]*callout[^"]*"[^>]*>[\s\S]*?Design goals/.test(htmlDocs), 'Design goals is not a callout');

  const calloutCssMatch = htmlDocs.match(/\.callout\s*\{([^}]+)\}/);
  if (calloutCssMatch) {
    const calloutCss = calloutCssMatch[1];
    assert.ok(!/border-left\s*:/.test(calloutCss) || /border-left\s*:\s*(?:0|none)/.test(calloutCss), 'No border-left on generic callout');
    assert.ok(!/border\s*:/.test(calloutCss) || /border\s*:\s*(?:0|none)/.test(calloutCss), 'No full border on generic callout');
  }

  const layoutHtml = html;
  assert.ok(!layoutHtml.includes('<link rel="icon" href="data:,'), 'Rejects empty data:, placeholder');
  assert.ok(layoutHtml.includes('href="data:image/svg+xml'), 'Favicon matches brand mark icon contract (encoded SVG data URL)');

  const forbiddenLandingSubstrings = ['data-enhanced-controls', 'data-seek', 'data-action', 'AUTO MODE'];
  for (const term of forbiddenLandingSubstrings) {
    assert.ok(!html.includes(term), `Landing page must not contain "${term}"`);
  }

  const forbiddenSelectors = ['status', 'metric', 'caption', 'player', 'dashboard', 'hud', 'kpi', 'card-grid', 'controls'];
  const narrativeHtml = html.replace(/<dialog\b[^>]*data-search-dialog[\s\S]*?<\/dialog>/, '');
  for (const sel of forbiddenSelectors) {
    const classPattern = new RegExp(`class="[^"]*\\b${sel}\\b[^"]*"`);
    const idPattern = new RegExp(`id="[^"]*\\b${sel}\\b[^"]*"`);
    const dataPattern = new RegExp(`data-[^=\\s]*${sel}`);
    assert.ok(!classPattern.test(narrativeHtml), `Landing narrative must not contain class matching "${sel}"`);
    assert.ok(!idPattern.test(narrativeHtml), `Landing narrative must not contain id matching "${sel}"`);
    assert.ok(!dataPattern.test(narrativeHtml), `Landing narrative must not contain data-attribute matching "${sel}"`);
  }

  assert.ok(!html.includes('role="button"'), 'Narrative steps do not have role="button" initially');
  assert.ok(!html.includes('tabindex="0"'), 'Narrative steps do not have tabindex="0" initially');
  assert.ok(!html.includes('aria-current="step"'), 'No active playback status state');
  assert.ok(!clientJs.includes('requestAnimationFrame'), 'No rAF in animation-client.js');

  let hasRevealHooks = false;
  if (html.includes('reveal-on-scroll')) hasRevealHooks = true;
  if (html.includes('is-enhanced')) hasRevealHooks = true;
  assert.ok(hasRevealHooks, 'Enhancement / scroll reveal styling hooks exist');
  assert.ok(clientJs.includes('IntersectionObserver'), 'IntersectionObserver is used in client JS');

  const opacityZeroMatches = [...cleanCss.matchAll(/([^{}]+)\{[^}]*opacity:\s*0[^}]*\}/g)];
  for (const m of opacityZeroMatches) {
    const selector = m[1].trim();
    if (selector.includes('@keyframes') || selector.includes('from') || selector.includes('to') || selector.includes('%')) {
      continue;
    }
    if (selector.includes('.lp-anchor')) {
      // Shared heading anchors reveal via pure CSS hover/focus, not JS.
      continue;
    }
    assert.ok(selector.includes('.is-enhanced'), `Selector "${selector}" setting opacity: 0 must be scoped with .is-enhanced to support progressive enhancement static visibility`);
  }

  assert.ok(clientJs.includes("classList.contains('is-revealed')"), 'animation client skips chapters that are already revealed');
  assert.ok(clientJs.includes('unobserve'), 'animation client unobserves a chapter after its first reveal');
  assert.ok(!clientJs.includes('visibilitychange'), 'tab visibility changes cannot restart chapter motion');
  // Continuous loops are allowed only through the shared lp-* reference
  // utilities; ad-hoc infinite keyframes must not reappear locally.
  const infiniteAnimations = [...html.matchAll(/animation:[^;}]*infinite[^;}]*/g)].map((m) => m[0]);
  for (const animation of infiniteAnimations) {
    assert.match(animation, /lp-[a-z-]+/, `Infinite animation must use a shared lp-* keyframe: ${animation}`);
  }
  assert.ok(!html.includes('min-width: 840px'), 'No 840px minimum width on execution SVG');

  const chapterClasses = ['chapter-01', 'chapter-02', 'chapter-03', 'chapter-04'];
  const kickers = [
    '01 / Graph shape',
    '02 / Cache identity',
    '03 / Cache branch',
    '04 / Observable outcome'
  ];
  chapterClasses.forEach((cls, idx) => {
    assert.ok(html.includes(cls), `Chapter ${cls} is present`);
    const chHtml = getChapterHtml(html, cls);
    assert.ok(chHtml.includes(kickers[idx]), `Chapter ${cls} kicker title contains "${kickers[idx]}"`);
  });
  assert.ok(!html.includes('chapter-05'), 'Chapter 05 is excluded');

  const heroH1Product = 'Symbiote Engine';
  const heroH1Thesis = 'Portable graph execution, made observable.';
  const heroLead = 'Define a portable graph once. At runtime, registered behavior, cache decisions, lifecycle failures, and execution results stay explicit to the host without binding the graph to a product shell.';

  const introEyebrow = 'How it works';
  const introH2 = 'One graph. Every branch stays visible.';
  const introLead = 'Graph data meets registered behavior at runtime. Engine resolves cache identity, chooses reuse or execution, and returns lifecycle failures as node-scoped output.';

  const ch1Title = 'A graph stays portable until the host supplies behavior.';
  const ch1Para = 'JSON carries node types, parameters, and connections. The registry maps those types to behavior at runtime, so graph data remains independent of a product shell.';
  const ch2Title = 'Inputs and parameters become one repeatable identity.';
  const ch2Para = 'For lifecycle-enabled nodes, the default cache key is exactly JSON.stringify({ i: inputs, p: params }). Execution context reaches execute, but it is not part of that default key.';
  const ch3Title = 'Validation comes first; then the cache chooses the path.';
  const ch3Para = 'After validation and key resolution, a matching auto-mode entry returns stored output. A miss executes, may post-process the output, and then stores it under the resolved key.';
  const ch4Title = 'A lifecycle failure becomes output, not a hidden stop.';
  const ch4Para = 'Validation, execution, or post-processing errors become node-scoped { _error } output and a structured execution-log record. The traversal loop continues; later nodes still depend on their resolved inputs.';

  assert.ok(html.includes(heroH1Product), 'Hero H1 product');
  assert.ok(html.includes(heroH1Thesis), 'Hero H1 thesis');
  assert.ok(html.includes(heroLead), 'Hero lead');
  assert.ok(html.includes(introEyebrow), 'Intro eyebrow');
  assert.ok(html.includes(introH2), 'Intro H2');
  function getExactStoryLeadMatches(markup) {
    return [...markup.matchAll(/<p class="lp-section-lead">([^<]*)<\/p>/g)];
  }

  // Falsifying matches for getExactStoryLeadMatches
  assert.strictEqual(
    getExactStoryLeadMatches('<p class="not-lp-section-lead">intro lead content</p>').length,
    0,
    'getExactStoryLeadMatches rejects class substring'
  );
  assert.strictEqual(
    getExactStoryLeadMatches('<p class="lp-section-lead extra-class">intro lead content</p>').length,
    0,
    'getExactStoryLeadMatches rejects extra class'
  );

  const storyLeadMatches = getExactStoryLeadMatches(html);
  assert.strictEqual(storyLeadMatches.length, 1, 'exactly one <p class="lp-section-lead"> match');
  assert.strictEqual(storyLeadMatches[0][1], introLead, 'strict equality of raw inner text to the locked sentence');
  assert.ok(html.includes(ch1Title) && html.includes(ch1Para), 'Ch1 copy');
  assert.ok(html.includes(ch2Title) && html.includes(ch2Para), 'Ch2 copy');
  assert.ok(html.includes(ch3Title) && html.includes(ch3Para), 'Ch3 copy');
  assert.ok(html.includes(ch4Title) && html.includes(ch4Para), 'Ch4 copy');

  chapterClasses.forEach(cls => {
    const chHtml = getChapterHtml(html, cls);
    const svgRegex = /<svg[^>]*>([\s\S]*?)<\/svg>/g;
    let match;
    let svgIndex = 0;
    while ((match = svgRegex.exec(chHtml)) !== null) {
      svgIndex++;
      const svgOuter = match[0];
      const svgContent = match[1];

      const visualObjectsCount = (svgContent.match(/data-visual-object/g) || []).length;
      assert.ok(visualObjectsCount <= 5, `Chapter ${cls} SVG #${svgIndex} has at most 5 visual objects, got ${visualObjectsCount}`);
      const motionAccentsCount = (svgContent.match(/data-motion-accent/g) || []).length;
      assert.ok(motionAccentsCount <= 3, `Chapter ${cls} SVG #${svgIndex} has at most 3 motion accents, got ${motionAccentsCount}`);

      assert.ok(!svgContent.includes('<rect'), `Chapter ${cls} SVG #${svgIndex} contains <rect>`);
      assert.ok(!svgContent.includes('<marker') && !svgOuter.includes('marker-end') && !svgOuter.includes('url(#arrow)'), `Chapter ${cls} SVG #${svgIndex} contains arrow markers`);

      const rawTexts = svgContent.match(/<text\b[^>]*>([\s\S]*?)<\/text>/g);
      const texts = rawTexts ? rawTexts : [];
      assert.ok(texts.length <= 5, `Chapter ${cls} SVG #${svgIndex} has more than 5 text labels`);
      texts.forEach(t => {
        const textContent = t.replace(/<[^>]+>/g, '').trim();
        assert.ok(textContent.length <= 18, `Chapter ${cls} SVG #${svgIndex} label length > 18: "${textContent}"`);
      });

      const forbiddenS = ['status', '[ERROR]', 'timeout', 'console', 'telemetry'];
      for (const f of forbiddenS) {
        assert.ok(!svgOuter.includes(f), `Chapter ${cls} SVG #${svgIndex} contains forbidden text: ${f}`);
      }

      if (svgOuter.includes('mobile-only')) {
        assert.ok(/viewBox="0 0 270\b/.test(svgOuter), `Chapter \${cls} mobile SVG viewBox width must be exactly 270`);
      }
    }
  });



  // Assert mobile illustration label floor of 12 CSS pixels: all <text> elements in mobile SVGs must have font-size >= 12
  const mobileSvgRegex = /<svg[^>]*class="[^"]*mobile-only[^"]*"[^>]*>([\s\S]*?)<\/svg>/g;
  let mobileSvgMatch;
  let mobileSvgCount = 0;
  while ((mobileSvgMatch = mobileSvgRegex.exec(html)) !== null) {
    mobileSvgCount++;
    const svgContent = mobileSvgMatch[1];
    let textMatch;
    const textTagRegex = /<text\b([^>]*)>/g;
    let foundText = false;
    while ((textMatch = textTagRegex.exec(svgContent)) !== null) {
      foundText = true;
      const attrs = textMatch[1];
      const fsAttr = attrs.match(/font-size="([\d.]+)"/);
      const fsStyle = attrs.match(/style="[^"]*font-size:\s*([\d.]+)px/);
      let size = null;
      if (fsAttr) {
        size = parseFloat(fsAttr[1]);
      } else if (fsStyle) {
        size = parseFloat(fsStyle[1]);
      }
      assert.ok(size !== null, `Text element in mobile SVG ${mobileSvgCount} must have an explicit font-size attribute or inline style`);
      assert.ok(size >= 12, `Text element in mobile SVG ${mobileSvgCount} must have font-size >= 12, got ${size}`);
    }
    assert.ok(foundText, `Mobile SVG ${mobileSvgCount} should contain text elements`);
  }
  assert.ok(mobileSvgCount >= 4, `Expected at least 4 mobile SVGs for the four chapters, got ${mobileSvgCount}`);

  assert.ok(!html.includes('links-grid'), 'No links-grid should be present in footer/CTA area');
  assert.ok(!html.includes('link-item'), 'No link-item should be present in footer/CTA area');

  const closingCtaIdx = html.lastIndexOf('closing-cta');
  assert.notStrictEqual(closingCtaIdx, -1, 'Closing CTA section exists');
  const shellFooterIdx = html.indexOf('<footer', closingCtaIdx);
  const stackIdx = html.indexOf('class="lp-stack"', closingCtaIdx);
  const ctaEnd = stackIdx !== -1 ? stackIdx : (shellFooterIdx !== -1 ? shellFooterIdx : undefined);
  const footerHtml = html.substring(closingCtaIdx, ctaEnd);
  const rawLinks = footerHtml.match(/<a\s/g);
  const linkCount = rawLinks ? rawLinks.length : 0;
  assert.ok(linkCount <= 3, `Footer/CTA area has at most 3 links, got ${linkCount}`);
  assert.ok(footerHtml.toLowerCase().includes('github'), 'Footer/CTA area has a GitHub link');

  assert.notStrictEqual(stackIdx, -1, 'Landing carries the Symbiote stack section');
  const stackHtml = html.substring(stackIdx, shellFooterIdx !== -1 ? shellFooterIdx : undefined);
  const stackLinks = stackHtml.match(/<a\s/g) || [];
  assert.strictEqual(stackLinks.length, 2, 'Stack section links to the two sibling libraries');
  assert.ok(stackHtml.includes('aria-current="true"'), 'Stack section marks the current library');
  assert.ok(stackHtml.includes('symbiote-workspace'), 'Stack section names the flagship workspace track');

  assert.ok(!html.includes('diag-grid-1') && !html.includes('diag-grid-2'), 'No grid patterns in SVGs');

  const ch4Html = getChapterHtml(html, 'chapter-04');
  const rawCh4Tracks = [...ch4Html.matchAll(/<path[^>]*data-visual-object="track"[^>]*>/g)];
  const ch4Tracks = rawCh4Tracks.map(m => m[0]);
  assert.ok(ch4Tracks.length >= 2, 'Chapter 4 must contain at least 2 traversal track paths (desktop and mobile)');
  for (const track of ch4Tracks) {
    const dMatch = track.match(/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/);
    assert.ok(dMatch, `Track path must have d attribute: ${track}`);
    const dVal = dMatch[2];
    assert.ok(dVal.includes('C') || dVal.includes('c'), `Track path must be a cubic curve: ${track}`);

    const normalized = dVal.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const commands = normalized.split(/(?=[MmLlHhVvCcSsQqTtAaZz])/);

    let currentY = 0;
    const yValues = new Set();

    for (const cmd of commands) {
      const type = cmd[0];
      const args = cmd.slice(1).trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
      if (type === 'M' || type === 'm') {
        currentY = args[1];
        yValues.add(currentY);
      } else if (type === 'C') {
        yValues.add(args[1]);
        yValues.add(args[3]);
        currentY = args[5];
        yValues.add(currentY);
      } else if (type === 'c') {
        yValues.add(currentY + args[1]);
        yValues.add(currentY + args[3]);
        currentY = currentY + args[5];
        yValues.add(currentY);
      }
    }
    assert.ok(yValues.size >= 3, `Track path must have at least 3 distinct y values (non-collinear), got: ${[...yValues].join(', ')} in ${track}`);
  }

  const rawMobileSvgs = html.match(/<svg[^>]*class="[^"]*mobile-only[^"]*"[^>]*>/g);
  const mobileSvgsList = rawMobileSvgs ? rawMobileSvgs : [];
  assert.ok(mobileSvgsList.length > 0, 'Must have mobile SVGs');
  for (const svg of mobileSvgsList) {
    const vbMatch = svg.match(/viewBox="([^"]+)"/);
    assert.ok(vbMatch, `Mobile SVG must have viewBox: ${svg}`);
    assert.strictEqual(vbMatch[1], '0 0 270 220', `Mobile SVG viewBox must be exactly "0 0 270 220": ${svg}`);
  }

  const rawSvgOuterMatches = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/g);
  const svgOuterMatchesList = rawSvgOuterMatches ? rawSvgOuterMatches : [];
  const forbiddenTextsList = ['status', '[ERROR]', 'timeout', 'console', 'telemetry'];
  for (const svg of svgOuterMatchesList) {
    for (const word of forbiddenTextsList) {
      assert.ok(!svg.toLowerCase().includes(word.toLowerCase()), `SVG must not contain forbidden text: ${word}`);
    }
  }

  const rawMobileSvgContentMatches = html.match(/<svg[^>]*class="[^"]*mobile-only[^"]*"[^>]*>([\s\S]*?)<\/svg>/g);
  const mobileSvgContentMatchesList = rawMobileSvgContentMatches ? rawMobileSvgContentMatches : [];
  for (const svgContent of mobileSvgContentMatchesList) {
    const rawTextElements = svgContent.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
    const textElements = rawTextElements ? rawTextElements : [];
    for (const textElem of textElements) {
      const fontAttr = textElem.match(/font-size="([^"]+)"/);
      const fontStyle = textElem.match(/style="[^"]*font-size:\s*([^;"]+)px/);
      const sizeStr = fontAttr ? fontAttr[1] : (fontStyle ? fontStyle[1] : null);
      assert.ok(sizeStr, `Text element must have font-size: ${textElem}`);
      const size = parseFloat(sizeStr);
      assert.ok(size >= 13, `Text element font-size in mobile SVG must be >= 13, got ${size}: ${textElem}`);
    }
  }

  function stripKeyframes(cssText) {
    let result = '';
    let i = 0;
    while (i < cssText.length) {
      if (cssText.substring(i).startsWith('@keyframes')) {
        const braceIndex = cssText.indexOf('{', i);
        if (braceIndex === -1) {
          i++;
          continue;
        }
        let depth = 1;
        let j = braceIndex + 1;
        while (j < cssText.length && depth > 0) {
          if (cssText[j] === '{') depth++;
          else if (cssText[j] === '}') depth--;
          j++;
        }
        i = j;
      } else {
        result += cssText[i];
        i++;
      }
    }
    return result;
  }

  const declaredKeyframes = [];
  const keyframeMatches = cleanCss.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g);
  for (const match of keyframeMatches) {
    declaredKeyframes.push(match[1]);
  }

  const cssWithoutKeyframes = stripKeyframes(cleanCss);
  for (const name of declaredKeyframes) {
    const isUsed = new RegExp(`\\b${name}\\b`).test(cssWithoutKeyframes);
    assert.ok(isUsed, `Keyframe animation "${name}" is declared but never referenced in CSS rules`);
  }

  const motionAccentMatches = cleanCss.matchAll(/data-motion-accent\s*=\s*["']([^"']+)["']/g);
  for (const match of motionAccentMatches) {
    const accentVal = match[1];
    let inHtml = false;
    if (html.includes(`data-motion-accent="${accentVal}"`)) inHtml = true;
    if (html.includes(`data-motion-accent='${accentVal}'`)) inHtml = true;
    assert.ok(inHtml, `CSS rule references data-motion-accent="${accentVal}", but it is not used in HTML markup`);
  }

  assert.ok(!fs.existsSync('edit_test.cjs'), 'Scratch file edit_test.cjs must not exist in the workspace root');
});

test('Dependency and lock policy', () => {
  assert.ok(fs.existsSync('package-lock.json'), 'package-lock.json exists');
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assert.strictEqual(lock.lockfileVersion, 3, 'lockfile is v3');
});

test('Executable first graph example (from evidence.md)', async () => {
  const { Graph, Executor, registerNodeType } = await import(path.resolve('browser.js'));

  registerNodeType({
    type: 'docs/source',
    driver: {
      inputs: [],
      outputs: [{ name: 'value', type: 'number' }],
    },
    process: (_inputs, { value }) => ({ value }),
  });

  registerNodeType({
    type: 'docs/double',
    driver: {
      inputs: [{ name: 'value', type: 'number' }],
      outputs: [{ name: 'result', type: 'number' }],
    },
    process: ({ value }) => ({ result: value * 2 }),
  });

  const graph = new Graph();
  const source = graph.addNode('docs/source', { value: 21 });
  const double = graph.addNode('docs/double');
  graph.connect(source, 'value', double, 'value');

  const result = await new Executor().run(graph);
  assert.strictEqual(result.outputs[double].result, 42);
});

test('GraphHistory snapshot and undo semantics', async () => {
  const { Graph, GraphHistory } = await import(path.resolve('browser.js'));
  const graph = new Graph();
  const history = new GraphHistory();

  history.push([...graph.nodes.values()], graph.connections);
  assert.strictEqual(history.undo(), null, 'One snapshot alone returns null');

  graph.addNode('docs/source', { value: 1 });
  history.push([...graph.nodes.values()], graph.connections);

  const snapshot = history.undo();
  assert.ok(snapshot !== null, 'Two snapshots allow undo() to return a snapshot');
  assert.ok(Array.isArray(snapshot.nodes) && Array.isArray(snapshot.connections), 'Snapshot contains nodes and connections arrays');
});

test('Targeted verification contract: docs pages, links and safety rules', { concurrency: false }, async () => {
  // 1. Verify docsRoutes has exactly 7 routes
  const { docsRoutes } = await import(path.resolve('site/site.config.js'));
  assert.strictEqual(docsRoutes.length, 7, 'docsRoutes must have exactly 7 routes');
  const routePaths = docsRoutes.map(r => r.path);
  assert.deepStrictEqual(routePaths, [
    '/docs/',
    '/docs/getting-started/',
    '/docs/guide/',
    '/docs/runtime/',
    '/docs/rendering/',
    '/docs/reference/',
    '/docs/safety/'
  ], 'Exact ordered route array');

  // 2. Docs pages assertions
  const docsPages = [
    'docs/index.html',
    'docs/getting-started/index.html',
    'docs/guide/index.html',
    'docs/runtime/index.html',
    'docs/rendering/index.html',
    'docs/reference/index.html',
    'docs/safety/index.html'
  ];

  const forbiddenWording = [
    'strict JSON contracts',
    'distributed worker safety',
    'distributed media service',
    'every node runs lifecycle',
    'every graph node executes',
    'automatic unchanged-input detection',
    'deterministic hash',
    'durable cache',
    'socket inheritance',
    'required sockets enforced',
    'root GraphServer export',
    'sandboxed capture',
    'worker ranges are worker_threads',
    'built-in OpenAI',
    'built-in ElevenLabs',
    'proof attestation',
    'immutable verified repository',
    'all browser exports run in SSR',
    'all browser exports run in Web Workers',
    'Engine guarantees credential secrecy',
    '1.6.0',
    'force bypasses all cache',
    'providers fall back to generic'
  ];

  const titles = new Set();
  const descriptions = new Set();

  for (const page of docsPages) {
    const filePath = path.join('_site', page);
    assert.ok(fs.existsSync(filePath), `Page file ${page} must exist`);
    const sourcePath = path.join('site', page.replace(/\.html$/, '.html.js'));
    const html = renderSourceModule(sourcePath);

    // Semantic structure: one main, one h1, skip link
    const mainCount = (html.match(/<main/g) || []).length;
    assert.strictEqual(mainCount, 1, `Page ${page} must contain exactly one <main> tag`);

    // Check for H1 tag
    const h1Count = (html.match(/<h1/g) || []).length;
    assert.strictEqual(h1Count, 1, `Page ${page} must contain exactly one <h1> tag`);

    // Skip link must exist
    assert.ok(html.includes('class="skip-link"') || html.includes('id="skip-link"') || html.includes('href="#main-content"'), `Page ${page} must contain a skip link`);

    // Unique title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(titleMatch, `Page ${page} must have a title`);
    const titleText = titleMatch[1];
    assert.ok(!titles.has(titleText), `Title "${titleText}" must be unique across pages`);
    titles.add(titleText);

    // Unique meta description
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/) || html.match(/<meta\s+content="([^"]+)"\s+name="description"/);
    assert.ok(descMatch, `Page ${page} must have a meta description`);
    const descText = descMatch[1];
    assert.ok(!descriptions.has(descText), `Description "${descText}" must be unique across pages`);
    descriptions.add(descText);

    // Canonical link
    const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/) || html.match(/<link\s+href="([^"]+)"\s+rel="canonical"/);
    assert.ok(canonicalMatch, `Page ${page} must have a canonical link`);
    const canonicalUrl = canonicalMatch[1];
    const expectedCanonicalSuffix = page.replace('index.html', '');
    assert.ok(canonicalUrl.endsWith('/symbiote-engine/' + expectedCanonicalSuffix), `Canonical URL for ${page} must be correct: got ${canonicalUrl}`);

    // Active sidebar item: exactly one active lp-sidebar-link in the desktop sidebar
    const desktopSidebarMatch = html.match(/<aside\b[^>]*class="[^"]*lp-desktop-sidebar[^"]*"[^>]*>([\s\S]*?)<\/aside>/);
    assert.ok(desktopSidebarMatch, `Page ${page} must render a desktop sidebar`);
    const desktopSidebar = desktopSidebarMatch[1];
    const activeSidebarCount = (desktopSidebar.match(/class="[^"]*lp-sidebar-link[^"]*active[^"]*"/g) || []).length;
    assert.strictEqual(activeSidebarCount, 1, `Page ${page} must contain exactly one active sidebar link: got ${activeSidebarCount}`);
    assert.match(desktopSidebar, /class="[^"]*lp-sidebar-link[^"]*active[^"]*"[^>]*aria-current="page"/, `Page ${page} active sidebar link must carry aria-current="page"`);

    // No duplicate IDs
    const idRegex = /id="([^"]+)"/g;
    const ids = [];
    let match;
    while ((match = idRegex.exec(html)) !== null) {
      ids.push(match[1]);
    }
    const idSet = new Set(ids);
    assert.strictEqual(ids.length, idSet.size, `Page ${page} has duplicate IDs: ${JSON.stringify(ids.filter((item, index) => ids.indexOf(item) !== index))}`);

    // Forbidden wording check
    for (const forbidden of forbiddenWording) {
      assert.ok(!html.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden wording "${forbidden}" must not be present in page ${page}`);
    }

    // Anchors and relative links validation covering href, src, srcset, both quote styles
    const regexes = [
      /href="([^"]+)"/g, /href='([^']+)'/g,
      /src="([^"]+)"/g, /src='([^']+)'/g,
      /srcset="([^"]+)"/g, /srcset='([^']+)'/g
    ];

    function resolveUrl(url, currentPage) {
      if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('javascript:')) return null;
      if (url.startsWith('/')) {
        if (!url.startsWith('/symbiote-engine/')) {
          throw new Error(`Root-absolute URL "${url}" must start with /symbiote-engine/`);
        }
        let rel = url.substring('/symbiote-engine/'.length);
        if (rel === '' || rel.startsWith('#')) return 'index.html' + rel;
        return rel;
      }
      const currentDir = path.dirname(currentPage);
      return path.join(currentDir, url).replace(/\\/g, '/');
    }

    function resolveTargetFile(relPath) {
      if (!relPath) return null;
      let target = relPath.split('#')[0];
      if (target === '') return null;
      if (target.endsWith('/')) target += 'index.html';
      else if (!path.extname(target)) target += '/index.html';
      return target;
    }

    // Fixture-driven unit coverage for the URL resolver
    if (page === 'docs/index.html') {
      assert.throws(() => resolveUrl('/docs/guide/', 'index.html'), /must start with \/symbiote-engine\//, 'Fails on wrong root-absolute target');
      assert.strictEqual(resolveUrl('./asset.png', 'docs/guide/index.html'), 'docs/guide/asset.png', 'Resolves ./asset');
      assert.strictEqual(resolveUrl('../route/', 'docs/guide/index.html'), 'docs/route/', 'Resolves ../route/');
      assert.strictEqual(resolveTargetFile(resolveUrl('../route/', 'docs/guide/index.html')), 'docs/route/index.html', 'Maps trailing-slash route to index.html');
      assert.strictEqual(resolveTargetFile(resolveUrl('demo', 'docs/guide/index.html')), 'docs/guide/demo/index.html', 'Maps bare relative route to index.html');

      fs.mkdirSync('_site/tmp-fixture', { recursive: true });
      fs.writeFileSync('_site/tmp-fixture/index.html', '<div id="target-element"></div>');

      try {
        function checkFixtureUrl(u, p, h) {
          const resolvedPath = resolveUrl(u, p);
          if (resolvedPath === null) return;
          const targetFile = resolveTargetFile(resolvedPath);
          let targetHtml = h;
          if (targetFile) {
            const targetAbs = path.join('_site', targetFile);
            if (!fs.existsSync(targetAbs)) throw new Error(`Target file ${targetAbs} for "${u}" does not exist`);
            if (u.includes('#')) targetHtml = fs.readFileSync(targetAbs, 'utf8');
          }
          if (u.includes('#')) {
            const anchor = u.split('#')[1];
            if (anchor !== 'main-content') {
              const attributePattern = new RegExp(`(?:id|name)=(?:["']${anchor}["']|${anchor}(?:\\s|>))`);
              const hasId = attributePattern.test(targetHtml);
              if (!hasId) throw new Error(`Anchor "${u}" does not exist in target`);
            }
          }
        }

        assert.doesNotThrow(() => checkFixtureUrl('../tmp-fixture/#target-element', 'docs/index.html', ''), 'Passes on valid relative cross-page fragment');
        assert.throws(() => checkFixtureUrl('../tmp-fixture/#missing-element', 'docs/index.html', ''), /does not exist in target/, 'Fails on invalid relative cross-page fragment');
        assert.throws(() => checkFixtureUrl('../missing/', 'docs/index.html', ''), /does not exist/, 'Fails on missing relative target');
        assert.throws(() => checkFixtureUrl('./missing.png', 'docs/index.html', ''), /does not exist/, 'Fails on missing asset');

        const extractUrls = (htmlStr) => {
          const urls = [];
          for (const r of regexes) {
            let match;
            while ((match = r.exec(htmlStr)) !== null) {
              if (match[0].startsWith('srcset')) {
                const candidates = match[1].split(',').map(c => c.trim().split(' ')[0]).filter(Boolean);
                urls.push(...candidates);
                if (match[1].split(',').length > candidates.length) urls.push('');
              } else {
                urls.push(match[1]);
              }
            }
          }
          return urls;
        };

        assert.doesNotThrow(() => {
          const urls = extractUrls('<img srcset="../tmp-fixture/ 1x">');
          urls.forEach(u => checkFixtureUrl(u, 'docs/index.html', ''));
        }, 'Passes when srcset candidate exists');

        assert.throws(() => {
          const urls = extractUrls('<img srcset="../tmp-fixture/ 1x, ./missing.png 2x">');
          urls.forEach(u => {
            if (!u) throw new Error("Missing candidate");
            checkFixtureUrl(u, 'docs/index.html', '');
          });
        }, /does not exist/, 'Fails when second srcset candidate is missing');
      } finally {
        fs.rmSync('_site/tmp-fixture', { recursive: true, force: true });
      }
    }

    for (const r of regexes) {
      let match;
      while ((match = r.exec(html)) !== null) {
        if (match[0].startsWith('srcset')) {
          const candidates = match[1].split(',').map(c => c.trim().split(' ')[0]).filter(Boolean);
          if (match[1].split(',').length > candidates.length) {
            assert.fail(`Missing candidate in srcset in ${page}`);
          }
          candidates.forEach(url => checkUrl(url, page, html));
        } else {
          checkUrl(match[1], page, html);
        }
      }
    }

    function checkUrl(url, currentPage, currentHtml) {
      if (!url) return;
      let resolvedPath;
      try {
        resolvedPath = resolveUrl(url, currentPage);
      } catch (err) {
        assert.fail(`Error resolving ${url} in ${currentPage}: ${err.message}`);
      }
      if (resolvedPath === null) return;

      const targetFile = resolveTargetFile(resolvedPath);
      let targetHtml = currentHtml;

      if (targetFile) {
        const targetAbs = path.join('_site', targetFile);
        assert.ok(fs.existsSync(targetAbs), `Target file ${targetAbs} for "${url}" in ${currentPage} must exist`);
        if (url.includes('#')) {
          targetHtml = fs.readFileSync(targetAbs, 'utf8');
        }
      }

      if (url.includes('#')) {
        const anchor = url.split('#')[1];
        if (anchor !== 'main-content') {
          const attributePattern = new RegExp(`(?:id|name)=(?:["']${anchor}["']|${anchor}(?:\\s|>))`);
          const hasId = attributePattern.test(targetHtml);
          assert.ok(hasId, `Anchor "${url}" in ${currentPage} must resolve to an element with that ID`);
        }
      }
    }
  }

  // 4. Reference data exact check
  const refDataPath = path.resolve('site/docs/reference-data.js');
  assert.ok(fs.existsSync(refDataPath), "Reference data script must exist before import");
  const { packageExports, symbolInventory } = await import(refDataPath);

  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const pkgExports = Object.keys(pkg.exports || {}).sort();
  const genExports = packageExports.map(e => e.key).sort();
  assert.deepStrictEqual(genExports, pkgExports, 'Generated reference export-map keys match package.json exactly');

  const rootMod = await import(path.resolve('index.js'));
  const browserMod = await import(path.resolve('browser.js'));

  const liveKeys = Array.from(new Set([...Object.keys(rootMod), ...Object.keys(browserMod)])).sort();
  const genKeys = symbolInventory.map(s => s.name).sort();
  assert.deepStrictEqual(genKeys, liveKeys, 'Generated symbol rows match live root/browser namespaces exactly');

  // 3. Deployed JavaScript node --check check
  const jsFiles = ['_site/animation/index.js', '_site/demo/index.js'];
  for (const jsFile of jsFiles) {
    execSync(`node --check ${jsFile}`);
  }
});

test('site sources use only shared package and narrow Symbiote UI contracts', () => {
  const duplicatedModules = [
    'site/layout.js',
    'site/search.js',
    'site/search/index.js',
    'site/url.js',
    'site/docs/shell.js',
    'site/docs/routes.js',
  ];
  for (const duplicated of duplicatedModules) {
    assert.ok(!fs.existsSync(duplicated), `${duplicated} must be deleted; the shared package owns these mechanics`);
  }

  function collectJs(dir, fileList = []) {
    for (const entry of fs.readdirSync(dir)) {
      const entryPath = path.join(dir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        collectJs(entryPath, fileList);
      } else if (entry.endsWith('.js')) {
        fileList.push(entryPath);
      }
    }
    return fileList;
  }

  for (const sourceFile of collectJs('site')) {
    const source = fs.readFileSync(sourceFile, 'utf8');
    assert.ok(!source.includes('.cb-'), `${sourceFile} must not touch private .cb- selectors`);
    assert.ok(!source.includes('#cb-'), `${sourceFile} must not touch private #cb- selectors`);
    assert.ok(!source.includes("symbiote-ui/ui"), `${sourceFile} must not import broad symbiote-ui/ui`);
    assert.ok(!source.includes('GraphExplorerShell'), `${sourceFile} must not reference GraphExplorerShell`);
  }
});
