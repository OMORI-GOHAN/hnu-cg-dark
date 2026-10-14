/* Normalize imported light rich text without changing document content. */
(() => {
    // 控制台与题干共用颜色检测；code/textarea 仍走专用主题。
    const roots = '[id^="answerForm"], [id^="tts"], .cgProblemContentClass, '
        + '#cgsoucecode, #cgcode_RightContainer .cgcode_header__3dyn.cgcode_wrapper__3Gl0, '
        + '.cgloader-container';
    const excluded = 'pre, code, a, input, textarea, select, button, img, picture, '
        + 'svg, canvas, iframe, video, .CodeMirror, .katex, .MathJax, '
        + '.no-dark-filter, [data-cg-dark-preserve]';
    const backgroundFlag = 'data-cg-dark-background';
    const textFlag = 'data-cg-dark-text';

    // 原站用 document.open/write 重建结果 iframe，原文档的扩展 CSS 会被清空。
    // 只恢复已知加载动画文档，不接管结果页，也不访问跨域 iframe。
    // 提交瞬间是 loading2.gif，评判阶段的动画由服务端插入 #result。
    // 后者不依赖固定文件名，限定在评判结果容器内识别 GIF。
    const loadingImage = 'img[src="/images/loading2.gif"], img[src$="/images/loading2.gif"], '
        + '#result img[src*=".gif" i]';
    const loadingStyleId = 'hnu-cg-dark-loading';
    const loadingCSS = `
        html, body { background: #0d1117 !important; color: #e6edf3 !important; }
        ${loadingImage} { background: white; filter: invert(1) hue-rotate(180deg); }
    `;
    const watchedFrames = new WeakSet();
    const frameObservers = new WeakMap();

    function watchResultFrame(frame) {
        let doc;
        try {
            doc = frame.contentDocument;
        } catch {
            return;
        }
        if (!doc) return;

        function restoreLoadingStyle() {
            if (!doc.querySelector(loadingImage) || doc.getElementById(loadingStyleId)) return;
            const style = doc.createElement('style');
            style.id = loadingStyleId;
            style.textContent = loadingCSS;
            (doc.head || doc.documentElement)?.append(style);
        }

        const previous = frameObservers.get(frame);
        if (previous?.doc !== doc) {
            previous?.observer.disconnect();
            const observer = new MutationObserver(restoreLoadingStyle);
            // 监听 Document，才能在 html/head 被整体替换后继续工作。
            observer.observe(doc, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src'],
            });
            frameObservers.set(frame, { doc, observer });
        }
        restoreLoadingStyle();
    }

    function scanResultFrames() {
        for (const frame of document.querySelectorAll('iframe#showmessageFRAME')) {
            if (!watchedFrames.has(frame)) {
                watchedFrames.add(frame);
                frame.addEventListener('load', () => watchResultFrame(frame));
            }
            watchResultFrame(frame);
        }
    }

    // CSSOM normalizes common hex, named and RGB colors to rgb()/rgba().
    function neutralColor(value) {
        const match = value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
        if (!match) return null;
        const channels = match.slice(1, 4).map(Number);
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (alpha < 0.2 || Math.max(...channels) - Math.min(...channels) > 24) return null;
        return channels.reduce((sum, channel) => sum + channel, 0) / 3;
    }

    function scan() {
        scanResultFrames();
        for (const root of document.querySelectorAll(roots)) {
            const elements = [root, ...root.querySelectorAll('*')];
            // Remove only our annotations before measuring the page's colors.
            for (const element of elements) {
                element.removeAttribute(backgroundFlag);
                element.removeAttribute(textFlag);
            }
            const changes = [];
            for (const element of elements) {
                if (element.closest(excluded)) continue;
                const style = getComputedStyle(element);
                const background = neutralColor(style.backgroundColor);
                const text = neutralColor(style.color);
                changes.push({ element, background: background >= 200, text: text !== null && text <= 120 });
            }
            // Batch writes after reads, retaining colored semantic highlights.
            for (const change of changes) {
                if (change.background) change.element.setAttribute(backgroundFlag, '');
                if (change.text) change.element.setAttribute(textFlag, '');
            }
        }
    }

    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            scan();
        });
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'id'],
    });
    schedule();
})();
