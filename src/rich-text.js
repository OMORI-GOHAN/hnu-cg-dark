/* Normalize imported light rich text without changing document content. */
(() => {
    const roots = '[id^="answerForm"], [id^="tts"], .cgProblemContentClass';
    const excluded = 'pre, code, a, input, textarea, select, button, img, picture, '
        + 'svg, canvas, iframe, video, .CodeMirror, .katex, .MathJax, '
        + '.no-dark-filter, [data-cg-dark-preserve]';
    const backgroundFlag = 'data-cg-dark-background';
    const textFlag = 'data-cg-dark-text';

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
