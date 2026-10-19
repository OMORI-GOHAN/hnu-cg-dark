const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../src/rich-text.js'), 'utf8');

for (const frameId of ['showmessageFRAME', 'showmessageFrame']) {
    test(`${frameId}: restores loading styles after document replacement and navigation`, () => {
        const observers = [];
        const events = {};
        function frameDocument() {
            const doc = {
                loading: false,
                style: null,
                querySelector(selector) {
                    assert.ok(selector.includes('#result img[src*=".gif" i]'),
                        'also detects the server-rendered judging animation');
                    return this.loading ? {} : null;
                },
                getElementById() { return this.style; },
                createElement() { return {}; },
            };
            doc.head = { append(style) { doc.style = style; } };
            return doc;
        }
        const doc = frameDocument();
        const frame = {
            id: frameId,
            contentDocument: doc,
            addEventListener(name, callback) { events[name] = callback; },
        };
        const wrapper = {
            flags: new Set(),
            querySelectorAll: () => [],
            closest: () => null,
            removeAttribute(name) { this.flags.delete(name); },
            setAttribute(name) { this.flags.add(name); },
        };
        vm.runInNewContext(source, {
            document: {
                documentElement: {},
                querySelectorAll(selector) {
                    if (selector.startsWith('iframe')) {
                        // Model ID matching instead of returning a frame for any selector.
                        if (selector === 'iframe[id="showmessageframe" i]') {
                            return frame.id.toLowerCase() === 'showmessageframe' ? [frame] : [];
                        }
                        return selector === `iframe#${frame.id}` ? [frame] : [];
                    }
                    assert.ok(selector.includes('.cgcode_header__3dyn'));
                    assert.ok(selector.includes('.cgloader-container'));
                    assert.ok(selector.includes('#index_problems'));
                    assert.ok(selector.includes('#cgcode_description-content'));
                    assert.ok(selector.includes('.add-style-srv-time'));
                    assert.ok(selector.includes('.navbar:has(#prolistDropdown) .dropdown-menu'));
                    return [wrapper];
                },
            },
            getComputedStyle: () => ({ backgroundColor: 'rgb(250, 250, 250)', color: 'rgb(51, 51, 51)' }),
            requestAnimationFrame: callback => callback(),
            MutationObserver: class {
                constructor(callback) { this.callback = callback; observers.push(this); }
                observe(target) { this.target = target; }
                disconnect() { this.disconnected = true; }
            },
        });
        assert.ok(wrapper.flags.has('data-cg-dark-background'));
        assert.ok(wrapper.flags.has('data-cg-dark-text'));
        const observer = observers.find(item => item.target === doc);
        assert.ok(observer, `must watch the actual iframe ID ${frameId}`);
        assert.equal(doc.style, null, 'normal result documents are left alone');
        doc.loading = true;
        observer.callback();
        assert.match(doc.style.textContent, /background: #0d1117/);
        assert.ok(doc.style.textContent.includes('#result img[src*=".gif" i]'));
        const firstStyle = doc.style;
        observer.callback();
        assert.equal(doc.style, firstStyle, 'does not duplicate the stylesheet');
        doc.style = null; // document.open/write removed the previous head.
        observer.callback();
        assert.ok(doc.style, 'restores styles on a subsequent submission');
        const next = frameDocument();
        next.loading = true;
        frame.contentDocument = next;
        events.load();
        assert.ok(observer.disconnected, 'disconnects the previous document');
        assert.ok(next.style, 'reattaches after iframe navigation');
        frame.contentDocument = null; // Cross-origin documents are inaccessible.
        assert.doesNotThrow(() => events.load());
    });
}
