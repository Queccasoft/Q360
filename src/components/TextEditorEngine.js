export const TextEditorEngine = {
    useCSS: false,

    execute(method, value, selection) {
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const normalizedMethod = method.toLowerCase();

        if (['copy', 'cut', 'paste', 'undo', 'redo'].includes(normalizedMethod)) {
            this.handleSystemCommands(normalizedMethod, value, selection, range);
            return;
        }

        const handlerName = Object.keys(this.handlers).find(
            key => key.toLowerCase() === normalizedMethod
        );

        if (handlerName && this.handlers[handlerName]) {
            this.handlers[handlerName](range, value, selection, this);
        } else {
            console.warn(`TextEditorEngine: Command "${method}" is not supported yet.`);
        }
    },

    handlers: {
        bold: (range, val, sel, engine) => engine.toggleTag(range, 'strong', sel),
        italic: (range, val, sel, engine) => engine.toggleTag(range, 'em', sel),
        underline: (range, val, sel, engine) => engine.toggleTag(range, 'u', sel),
        strikethrough: (range, val, sel, engine) => engine.toggleTag(range, 's', sel),
        subscript: (range, val, sel, engine) => engine.toggleTag(range, 'sub', sel),
        superscript: (range, val, sel, engine) => engine.toggleTag(range, 'sup', sel),

        justifyleft: (range, val, sel, engine) => engine.applyAlignment(range, 'left'),
        justifycenter: (range, val, sel, engine) => engine.applyAlignment(range, 'center'),
        justifyright: (range, val, sel, engine) => engine.applyAlignment(range, 'right'),
        justifyfull: (range, val, sel, engine) => engine.applyAlignment(range, 'justify'),

        backcolor: (range, val, sel, engine) => engine.applyStyle(range, 'backgroundColor', val, sel),
        forecolor: (range, val, sel, engine) => engine.applyStyle(range, 'color', val, sel),
        fontname: (range, val, sel, engine) => engine.applyStyle(range, 'fontFamily', val, sel),
        fontsize: (range, val, sel, engine) => engine.applyStyle(range, 'fontSize', val, sel),

        textshadow: (range, config, sel, engine) => {
            const shadowStyle = `${config.offset}px ${config.offset}px ${config.blur}px ${config.color}`;
            engine.applyStyle(range, 'textShadow', shadowStyle, sel);
        },

        formatblock: (range, val, sel, engine) => engine.changeBlockTag(range, val, sel),
        removeformat: (range, val, sel, engine) => engine.clearFormatting(range, sel),
        insertorderedlist: (range, val, sel, engine) => engine.toggleList(range, 'ol', sel),
        insertunorderedlist: (range, val, sel, engine) => engine.toggleList(range, 'ul', sel),
        insertnestedorderedlist: (range, val, sel, engine) => engine.nestedToggleList(range, 'ol', sel),
        insertnestedunorderedlist: (range, val, sel, engine) => engine.nestedToggleList(range, 'ul', sel),
        outdent: (range, val, sel, engine) => engine.handleIndentation(range, 'outdent'),
        indent: (range, val, sel, engine) => engine.handleIndentation(range, 'indent'), 
        letterspacing: (range, val, sel, engine) => engine.applyStyle(range, 'letterSpacing', val, sel), // Inline character spacing
        wordspacing: (range, val, sel, engine) => engine.applyStyle(range, 'wordSpacing', val, sel),    // Inline word spacing
        lineheight: (range, val, sel, engine) => engine.applyBlockStyle(range, 'lineHeight', val),     // Block-level line spacing

        createlink: (range, val, sel, engine) => engine.wrapWithAttribute(range, 'a', 'href', val, sel),
        unlink: (range, val, sel, engine) => engine.unwrapSpecificTag(range, 'a', sel),
        insertimage: (range, val, sel, engine) => engine.insertHTMLNode(range, `<img src="${val}" alt="image" />`, sel),
        inserthorizontalrule: (range, val, sel, engine) => engine.insertHTMLNode(range, `<hr/>`, sel),
        insertlinebreak: (range, val, sel, engine) => engine.insertHTMLNode(range, `<br/>`, sel),
        
        insertparagraph: (range, val, sel, engine) => {
            let node = range.startContainer;
            const root = engine.getEditorRoot(range);
            let block = node.nodeType === 3 ? node.parentNode : node;
            block = block.closest('div, p, h1, h2, h3, h4, h5, h6, li') || root;

            const isLI = block.tagName === 'LI';
            const isEmpty = !block.textContent.replace(/\u200B/g, '').trim() && !block.querySelector('img, hr, br');

            if (isLI && isEmpty) {
                const list = block.parentNode;
                const listParent = list.parentNode;
                const postListRange = document.createRange();
                postListRange.setStartAfter(block);
                postListRange.setEndAfter(list.lastChild);
                const postListContent = postListRange.extractContents();
                const exitBlock = document.createElement('div');
                exitBlock.innerHTML = '&#8203;';
                listParent.insertBefore(exitBlock, list.nextSibling);
                if (postListContent.childNodes.length > 0) {
                    const postList = list.cloneNode(false);
                    postList.appendChild(postListContent);
                    listParent.insertBefore(postList, exitBlock.nextSibling);
                }
                block.remove();
                if (list.childNodes.length === 0) list.remove();
                engine.reselectNode(exitBlock, sel);
                return;
            }

            range.deleteContents();
            let current = node.nodeType === 3 ? node.parentNode : node;
            let wrappers = [];
            while (current && current !== block && current !== root) {
                wrappers.push(current.cloneNode(false)); 
                current = current.parentNode;
            }

            const postRange = document.createRange();
            postRange.setStart(range.endContainer, range.endOffset);
            postRange.setEnd(block, block.childNodes.length);
            const postContent = postRange.extractContents();
            const newBlock = document.createElement(block !== root ? block.tagName : 'div');
            newBlock.appendChild(postContent);
            const hasVisibleContent = newBlock.textContent.replace(/\u200B/g, '').length > 0 || newBlock.querySelector('img, hr, br');

            if (!hasVisibleContent) {
                newBlock.innerHTML = ''; 
                let pointer = newBlock;
                for (let i = wrappers.length - 1; i >= 0; i--) {
                    pointer.appendChild(wrappers[i]); 
                    pointer = wrappers[i];
                }
                pointer.innerHTML = '&#8203;'; 
            }

            if (block !== root && block.parentNode) {
                block.parentNode.insertBefore(newBlock, block.nextSibling);
            } else {
                root.appendChild(newBlock);
            }

            const newRange = document.createRange();
            let focusNode = newBlock;
            while(focusNode.firstChild) focusNode = focusNode.firstChild;
            
            if (focusNode.nodeType === 3) {
                newRange.setStart(focusNode, focusNode.textContent === '\u200B' ? 1 : 0);
            } else {
                newRange.selectNodeContents(newBlock);
            }
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        },

        inserttext: (range, val, sel, engine) => engine.insertText(range, val, sel),
        inserthtml: (range, val, sel, engine) => engine.insertHTMLNode(range, val, sel),
        delete: (range, val, sel, engine) => range.deleteContents(),
        forwarddelete: (range, val, sel, engine) => {
            if (!range.collapsed) {
                range.deleteContents();
            } else {
                range.setEnd(range.endContainer, Math.min(range.endOffset + 1, range.endContainer.length));
                range.deleteContents();
            }
        },
        selectall: (range, val, sel, engine) => {
            const editor = engine.getEditorRoot(range);
            if (editor) {
                const newRange = document.createRange();
                newRange.selectNodeContents(editor);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        },
        stylewithcss: (range, val, sel, engine) => { engine.useCSS = true; },
        usecss: (range, val, sel, engine) => { engine.useCSS = false; },
        defaultparagraphseparator: () => { }
    },

    // --- HELPER METHODS ---

    toggleList(range, listType, selection) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const root = this.getEditorRoot(range);
        const existingList = node.closest('ul, ol');
        
        if (existingList && root.contains(existingList)) {
            if (existingList.tagName.toLowerCase() === listType) {
                const frag = document.createDocumentFragment();
                const items = Array.from(existingList.querySelectorAll('li'));
                items.forEach(li => {
                    const block = document.createElement('div');
                    while (li.firstChild) block.appendChild(li.firstChild);
                    frag.appendChild(block);
                });
                existingList.parentNode.replaceChild(frag, existingList);
            } else {
                const newList = document.createElement(listType);
                while (existingList.firstChild) newList.appendChild(existingList.firstChild);
                existingList.parentNode.replaceChild(newList, existingList);
            }
        } else {
            const block = node.closest('div, p, h1, h2, h3, h4, h5, h6') || node;
            const list = document.createElement(listType);
            const li = document.createElement('li');
            if (block && block !== root && root.contains(block)) {
                while (block.firstChild) li.appendChild(block.firstChild);
                list.appendChild(li);
                block.parentNode.replaceChild(list, block);
            } else {
                const frag = range.extractContents();
                if (frag.childNodes.length === 0) {
                    li.innerHTML = '&#8203;'; 
                } else {
                    li.appendChild(frag);
                }
                list.appendChild(li);
                range.insertNode(list);
            }
            this.reselectNode(li, selection);
        }
    },

    nestedToggleList(range, listType, selection) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const li = node.closest('li');
        if (!li) {
            this.toggleList(range, listType, selection);
            return;
        }
        const newList = document.createElement(listType);
        const newLi = document.createElement('li');
        const frag = range.extractContents();
        if (frag.textContent.length === 0 && !frag.querySelector('*')) {
            newLi.innerHTML = '&#8203;';
        } else {
            newLi.appendChild(frag);
        }
        newList.appendChild(newLi);
        li.appendChild(newList);
        this.reselectNode(newLi, selection);
    },

    toggleTag(range, tagName, selection) {
        const el = this.getSafeElement(range.commonAncestorContainer);
        tagName = tagName.toLowerCase();
        let isCollapsedOriginal = range.collapsed;
        let zwspNode = null;

        if (isCollapsedOriginal) {
            zwspNode = document.createTextNode('\u200B');
            range.insertNode(zwspNode);
            range.selectNode(zwspNode); 
        }

        const existingTag = el.closest(tagName);

        if (existingTag) {
            const parent = existingTag.parentNode;
            const fullRange = document.createRange();
            fullRange.selectNodeContents(existingTag);

            const preRange = document.createRange();
            preRange.setStart(fullRange.startContainer, fullRange.startOffset);
            preRange.setEnd(range.startContainer, range.startOffset);

            const postRange = document.createRange();
            postRange.setStart(range.endContainer, range.endOffset);
            postRange.setEnd(fullRange.endContainer, fullRange.endOffset);

            const postContent = postRange.extractContents();
            const preContent = preRange.extractContents();

            if (preContent.textContent.length > 0 || preContent.querySelector('*')) {
                const preTag = document.createElement(tagName);
                preTag.appendChild(preContent);
                parent.insertBefore(preTag, existingTag);
            }

            const startMarker = document.createTextNode('');
            const endMarker = document.createTextNode('');
            parent.insertBefore(startMarker, existingTag);

            while (existingTag.firstChild) {
                parent.insertBefore(existingTag.firstChild, existingTag);
            }

            parent.insertBefore(endMarker, existingTag);

            if (postContent.textContent.length > 0 || postContent.querySelector('*')) {
                const postTag = document.createElement(tagName);
                postTag.appendChild(postContent);
                parent.insertBefore(postTag, existingTag);
            }

            parent.removeChild(existingTag);

            // --- FIXED UNWRAP SELECTION LOGIC ---
            const newRange = document.createRange();
            if (isCollapsedOriginal && zwspNode) {
                newRange.setStart(zwspNode, 1);
            } else {
                // Get indices before removing markers to ensure stable selection
                const startIndex = Array.from(parent.childNodes).indexOf(startMarker);
                const endIndex = Array.from(parent.childNodes).indexOf(endMarker);
                
                startMarker.remove(); // Clean markers first
                endMarker.remove();

                // Restore selection using parent indices (Robust against removal)
                newRange.setStart(parent, startIndex);
                newRange.setEnd(parent, endIndex - 1); 
            }
            newRange.collapse(isCollapsedOriginal);
            selection.removeAllRanges();
            selection.addRange(newRange);
            // --- END FIXED LOGIC ---

        } else {
            const fragment = range.extractContents();
            fragment.querySelectorAll(tagName).forEach(inner => {
                while(inner.firstChild) inner.parentNode.insertBefore(inner.firstChild, inner);
                inner.parentNode.removeChild(inner);
            });
            const wrapper = document.createElement(tagName);
            wrapper.appendChild(fragment);
            range.insertNode(wrapper);

            if (isCollapsedOriginal && zwspNode) {
                const newRange = document.createRange();
                newRange.setStart(zwspNode, 1);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                this.reselectNode(wrapper, selection);
            }
        }
    },

    applyStyle(range, styleProp, value, selection) {
        if (!range && selection) range = selection.getRangeAt(0);
        if (!range) return;

        const el = this.getSafeElement(range.commonAncestorContainer);
        const isFontSize = styleProp === 'fontSize';
        const needsPx = ['fontSize', 'letterSpacing', 'wordSpacing'].includes(styleProp);
        const finalValue = (needsPx && !isNaN(value) && value !== '') ? `${value}px` : value;
        let isCollapsedOriginal = range.collapsed;
        let zwspNode = null;

        if (isCollapsedOriginal) {
            zwspNode = document.createTextNode('\u200B');
            range.insertNode(zwspNode);
            range.selectNode(zwspNode);
        }

        const existingSpan = el.closest('span');
        const hasSameStyle = existingSpan && 
                             existingSpan.style[styleProp] && 
                             existingSpan.style[styleProp].replace(/\s/g, '') === finalValue.toString().replace(/\s/g, '');

        if (hasSameStyle) {
            const parent = existingSpan.parentNode;
            const fullRange = document.createRange();
            fullRange.selectNodeContents(existingSpan);

            const preRange = document.createRange();
            preRange.setStart(fullRange.startContainer, fullRange.startOffset);
            preRange.setEnd(range.startContainer, range.startOffset);

            const postRange = document.createRange();
            postRange.setStart(range.endContainer, range.endOffset);
            postRange.setEnd(fullRange.endContainer, fullRange.endOffset);

            const postContent = postRange.extractContents();
            const preContent = preRange.extractContents();

            if (preContent.textContent.length > 0 || preContent.querySelector('*')) {
                const preTag = existingSpan.cloneNode(false);
                preTag.appendChild(preContent);
                parent.insertBefore(preTag, existingSpan);
            }

            const startMarker = document.createTextNode('');
            const endMarker = document.createTextNode('');
            parent.insertBefore(startMarker, existingSpan);

            const midTag = existingSpan.cloneNode(false);
            midTag.style[styleProp] = '';

            if (!midTag.getAttribute('style') || midTag.style.length === 0) {
                while(existingSpan.firstChild) parent.insertBefore(existingSpan.firstChild, existingSpan);
            } else {
                while(existingSpan.firstChild) midTag.appendChild(existingSpan.firstChild);
                parent.insertBefore(midTag, existingSpan);
            }

            parent.insertBefore(endMarker, existingSpan);

            if (postContent.textContent.length > 0 || postContent.querySelector('*')) {
                const postTag = existingSpan.cloneNode(false);
                postTag.appendChild(postContent);
                parent.insertBefore(postTag, existingSpan);
            }

            parent.removeChild(existingSpan);

            // --- FIXED STYLE REMOVAL SELECTION LOGIC ---
            const newRange = document.createRange();
            if (isCollapsedOriginal && zwspNode) {
                newRange.setStart(zwspNode, 1);
            } else {
                // Determine indices within parent to keep selection alive after marker removal
                const startIndex = Array.from(parent.childNodes).indexOf(startMarker);
                const endIndex = Array.from(parent.childNodes).indexOf(endMarker);
                
                startMarker.remove(); // Remove markers before applying final selection
                endMarker.remove();

                newRange.setStart(parent, startIndex);
                newRange.setEnd(parent, endIndex - 1);
            }
            newRange.collapse(isCollapsedOriginal);
            selection.removeAllRanges();
            selection.addRange(newRange);
            // --- END FIXED LOGIC ---

        } else {
            const fragment = range.extractContents();
            fragment.querySelectorAll('span').forEach(s => {
                s.style[styleProp] = '';
                if (!s.getAttribute('style') || s.style.length === 0) {
                    while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
                    s.parentNode.removeChild(s);
                }
            });

            const wrapper = document.createElement('span');
            wrapper.style[styleProp] = finalValue;
            wrapper.appendChild(fragment);
            range.insertNode(wrapper);

            if (isCollapsedOriginal && zwspNode) {
                const newRange = document.createRange();
                newRange.setStart(zwspNode, 1);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                this.reselectNode(wrapper, selection);
            }
        }
    },

    applyAlignment(range, alignment) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const block = node.closest('div, p, h1, h2, h3, h4, h5, h6, li') || node;
        if (block && block.style) block.style.textAlign = alignment;
    },

    changeBlockTag(range, tagName, selection) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const block = node.closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, pre');
        const cleanTag = tagName.replace(/[<>]/g, ''); 
        const newBlock = document.createElement(cleanTag);
        if (block && block !== this.getEditorRoot(range)) {
            newBlock.innerHTML = block.innerHTML;
            block.parentNode.replaceChild(newBlock, block);
        } else {
            const fragment = range.extractContents();
            newBlock.appendChild(fragment);
            range.insertNode(newBlock);
        }
        this.reselectNode(newBlock, selection);
    },

    clearFormatting(range, selection) {
        if (range.collapsed) return;
        const fragment = range.extractContents();
        const div = document.createElement('div');
        div.appendChild(fragment);
        const tagsToStrip = ['strong', 'em', 'u', 's', 'sub', 'sup', 'span', 'font', 'a', 'b', 'i'];
        tagsToStrip.forEach(tagName => {
            const elements = div.querySelectorAll(tagName);
            elements.forEach(el => {
                while (el.firstChild) {
                    el.parentNode.insertBefore(el.firstChild, el);
                }
                el.parentNode.removeChild(el);
            });
        });
        const allRemaining = div.querySelectorAll('*');
        allRemaining.forEach(el => {
            el.removeAttribute('style');
            el.removeAttribute('class');
            el.removeAttribute('data-qshadow');
        });
        const finalFragment = document.createDocumentFragment();
        while (div.firstChild) {
            finalFragment.appendChild(div.firstChild);
        }
        range.insertNode(finalFragment);
        selection.removeAllRanges();
        selection.addRange(range);
    },

    wrapWithAttribute(range, tagName, attr, value, selection) {
        const element = document.createElement(tagName);
        element.setAttribute(attr, value);
        element.appendChild(range.extractContents());
        range.insertNode(element);
        this.reselectNode(element, selection);
    },

    unwrapSpecificTag(range, tagName, selection) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const existingTag = node.closest(tagName);
        if (existingTag) {
            const parent = existingTag.parentNode;
            const docFrag = document.createDocumentFragment();
            while (existingTag.firstChild) {
                docFrag.appendChild(existingTag.firstChild);
            }
            parent.replaceChild(docFrag, existingTag);
        }
    },

    insertHTMLNode(range, htmlString, selection) {
        const template = document.createElement('template');
        template.innerHTML = htmlString.trim();
        const frag = template.content;
        range.deleteContents(); 
        const lastNode = frag.lastChild;
        range.insertNode(frag);
        if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    },

    insertText(range, text, selection) {
        const textNode = document.createTextNode(text);
        range.deleteContents();
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    },

    handleIndentation(range, action) {
    const root = this.getEditorRoot(range);
    if (!root) return;

    // 1. Create a list of all block elements that intersect with the selection
    const blocks = new Set();
    
    // Helper to find the nearest valid block for any given node
    const getBlock = (node) => {
        if (!node || node === root) return null;
        let el = node.nodeType === 3 ? node.parentNode : node;
        return el.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
    };

    // 2. Identify start and end blocks
    const startBlock = getBlock(range.startContainer);
    const endBlock = getBlock(range.endContainer);
    
    if (startBlock && root.contains(startBlock)) blocks.add(startBlock);
    if (endBlock && root.contains(endBlock)) blocks.add(endBlock);

    // 3. For multi-line selections, find all blocks in between
    if (!range.collapsed) {
        // Use TreeWalker to find all elements within the range's boundary
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let currentNode = walker.nextNode();
        while (currentNode) {
            // If the node is part of the selection, find its block container
            if (range.intersectsNode(currentNode)) {
                const b = getBlock(currentNode);
                if (b && root.contains(b) && b !== root) {
                    blocks.add(b);
                }
            }
            currentNode = walker.nextNode();
        }
    }

    // 4. Apply indentation to each unique block found in the selection
    blocks.forEach(block => {
        // Safety: Ensure we never indent the editor root itself
        if (block === root) return;

        const currentMargin = parseInt(window.getComputedStyle(block).marginLeft) || 0;
        const step = 40; // Your defined indentation step

        if (action === 'indent') {
            block.style.marginLeft = `${currentMargin + step}px`;
        } else if (action === 'outdent') {
            const newMargin = Math.max(0, currentMargin - step);
            // If margin is 0, remove the property to keep the DOM clean
            block.style.marginLeft = newMargin > 0 ? `${newMargin}px` : '';
        }
    });
},

    reselectNode(node, selection) {
        if (!node) return;
        const newRange = document.createRange();
        newRange.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(newRange);
    },

    getEditorRoot(range) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        return node.closest('[contenteditable="true"]');
    },

    handleSystemCommands(method, value, selection, range) {
        if (method === 'copy') {
            navigator.clipboard.writeText(selection.toString());
        } else if (method === 'cut') {
            navigator.clipboard.writeText(selection.toString()).then(() => range.deleteContents());
        } else if (method === 'paste') {
            navigator.clipboard.readText().then(text => this.insertText(range, text, selection));
        } else if (method === 'undo' || method === 'redo') {
            document.execCommand(method); 
        }
    },
    
    getSafeElement(node) {
        return node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    },

applyBlockStyle(range, styleProp, value) {
    const root = this.getEditorRoot(range);
    if (!root) return;

    const blocks = new Set();
    const getBlock = (node) => {
        if (!node || node === root) return null;
        let el = node.nodeType === 3 ? node.parentNode : node;
        return el.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
    };

    const startBlock = getBlock(range.startContainer);
    const endBlock = getBlock(range.endContainer);
    
    if (startBlock && root.contains(startBlock)) blocks.add(startBlock);
    if (endBlock && root.contains(endBlock)) blocks.add(endBlock);

    if (!range.collapsed) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let currentNode = walker.nextNode();
        while (currentNode) {
            if (range.intersectsNode(currentNode)) {
                const b = getBlock(currentNode);
                if (b && root.contains(b) && b !== root) blocks.add(b);
            }
            currentNode = walker.nextNode();
        }
    }

    blocks.forEach(block => {
        if (block !== root) {
            // Apply the style (e.g., lineHeight: 1.5 or 24px)
            block.style[styleProp] = value;
        }
    });
},
};
export default TextEditorEngine;