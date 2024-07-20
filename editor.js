/**
@licence
    Copyright (c) 2024 Alan Chandler, all rights reserved

    This file is part of html-editor.

    html-editor is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    html-editor is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with html-editor.  If not, see <http://www.gnu.org/licenses/>.

    The software is derived from the npm squire-rte package at https://github.com/neilj/Squire
    which is licenced using the MIT Licence as follows:

    Copyright © 2011–2023 by Neil Jenkins

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to
    deal in the Software without restriction, including without limitation the
    rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
    sell copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
    IN THE SOFTWARE

*/

import DOMPurify from './purify.es.js';

import { TreeIterator, SHOW_ELEMENT,SHOW_TEXT,SHOW_ELEMENT_OR_TEXT } from "./tree.js";
import {createElement, detach, empty, getNearest, getNodeName, hasTagAttributes, replaceWith} from './node.js';
import { fixCursor,isLineBreak, removeZWS } from './whitespace.js';
import {createRange, deleteContentsOfRange, expandRangeToBlockBoundaries , extractContentsOfRange, getEndBlockOfRange, getStartBlockOfRange, insertNodeInRange, 
      getTextContentsOfRange, moveRangeBoundariesDownTree, isNodeContainedInRange, 
      moveRangeBoundaryOutOf, moveRangeBoundariesUpTree} from './range.js';

import {getBlockWalker, getNextBlock, isEmptyBlock, isLeaf, isInline,  isContainer, isBlock, isSemantic, resetNodeCategoryCache } from './block.js';
import {mergeContainers, mergeInlines, split } from './mergesplit.js';
import { cleanTree, escapeHTML, removeEmptyInlines } from './clean.js';
import {  _onCopy, _onCut, _onDrop, _onPaste } from './clipboard.js';
import { keyHandlers, _onKey, _monitorShiftKey, } from './keyboard.js';

    /*
    linkRegExp = new RegExp(
        // Only look on boundaries
        '\\b(?:' +
        // Capture group 1: URLs
        '(' +
            // Add links to URLS
            // Starts with:
            '(?:' +
                // http(s):// or ftp://
                '(?:ht|f)tps?:\\/\\/' +
                // or
                '|' +
                // www.
                'www\\d{0,3}[.]' +
                // or
                '|' +
                // foo90.com/
                '[a-z0-9][a-z0-9.\\-]*[.][a-z]{2,}\\/' +
            ')' +
            // Then we get one or more:
            '(?:' +
                // Run of non-spaces, non ()<>
                '[^\\s()<>]+' +
                // or
                '|' +
                // balanced parentheses (one level deep only)
                '\\([^\\s()<>]+\\)' +
            ')+' +
            // And we finish with
            '(?:' +
                // Not a space or punctuation character
                '[^\\s?&`!()\\[\\]{};:\'".,<>«»“”‘’]' +
                // or
                '|' +
                // Balanced parentheses.
                '\\([^\\s()<>]+\\)' +
            ')' +
        // Capture group 2: Emails
        ')|(' +
            // Add links to emails
            '[\\w\\-.%+]+@(?:[\\w\\-]+\\.)+[a-z]{2,}\\b' +
            // Allow query parameters in the mailto: style
            '(?:' +
                '[?][^&?\\s]+=[^\\s?&`!()\\[\\]{};:\'".,<>«»“”‘’]+' +
                '(?:&[^&?\\s]+=[^\\s?&`!()\\[\\]{};:\'".,<>«»“”‘’]+)*' +
            ')?' +
        '))',
        'i'
    );
    */
    const linkRegExp = /\b(?:((?:(?:ht|f)tps?:\/\/|www\d{0,3}[.]|[a-z0-9][a-z0-9.\-]*[.][a-z]{2,}\/)(?:[^\s()<>]+|\([^\s()<>]+\))+(?:[^\s?&`!()\[\]{};:'".,<>«»“”‘’]|\([^\s()<>]+\)))|([\w\-.%+]+@(?:[\w\-]+\.)+[a-z]{2,}\b(?:[?][^&?\s]+=[^\s?&`!()\[\]{};:'".,<>«»“”‘’]+(?:&[^&?\s]+=[^\s?&`!()\[\]{};:'".,<>«»“”‘’]+)*)?))/i;
    const tagAfterSplit = {
      DT: "DD",
      DD: "DT",
      LI: "LI",
      PRE: "PRE"
    };



export default class Editor {
  constructor(root, config) {
    /**
     * Subscribing to these events won't automatically add a listener to the
     * document node, since these events are fired in a custom manner by the
     * editor code.
     */
    this.customEvents = /* @__PURE__ */ new Set([
      "pathChange",
      "select",
      "input",
      "pasteImage",
      "undoStateChange"
    ]);
    // ---

    this.hasTrailingSelector = false; 

    this._root = root;
    this._config = this._makeConfig(config);
    this._isFocused = false;
    this._lastSelection = createRange(root, 0);
    this._willRestoreSelection = false;
    this._mayHaveZWS = false;
    this._lastAnchorNode = null;
    this._lastFocusNode = null;
    this._path = "";
    this._events = /* @__PURE__ */ new Map();
    this._undoIndex = -1;
    this._undoStack = [];
    this._undoStackLength = 0;
    this._isInUndoState = false;
    this._ignoreChange = false;
    this._ignoreAllChanges = false;
    this.addEventListener("selectionchange", this._updatePathOnEvent);
    this.addEventListener("blur", this._enableRestoreSelection);
    this.addEventListener("mousedown", this._disableRestoreSelection);
    this.addEventListener("touchstart", this._disableRestoreSelection);
    this.addEventListener("focus", this._restoreSelection);
    this._isShiftDown = false;
    this.addEventListener("cut", _onCut);
    this.addEventListener("copy", _onCopy);
    this.addEventListener("paste", _onPaste);
    this.addEventListener("drop", _onDrop);
    this.addEventListener(
      "keydown",
      _monitorShiftKey
    );
    this.addEventListener("keyup", _monitorShiftKey);
    this.addEventListener("keydown", _onKey);

    const mutation = new MutationObserver(() => this._docWasChanged());
    mutation.observe(root, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true
    });
    this._mutation = mutation;
    root.setAttribute("contenteditable", "true");
    this.addEventListener(
      "beforeinput",
      this._beforeInput
    );
    this.setHTML("");
  }
  addEventListener(type, fn) {
    let handlers = this._events.get(type);
    let target = this._root;
    if (!handlers) {
      handlers = [];
      this._events.set(type, handlers);
      if (!this.customEvents.has(type)) {
        if (type === "selectionchange") {
          target = document;
        }
        target.addEventListener(type, this, true);
      }
    }
    handlers.push(fn);
    return this;
  }
  blur() {
    this._root.blur();
    return this;
  }
  bold() {
    return this.changeFormat({ tag: "B" });
  }
  changeFormat(add, remove, range, partial) {
    if (!range) {
      range = this.getSelection();
    }
    this.saveUndoState(range);
    if (remove) {
      range = this._removeFormat(
        remove.tag.toUpperCase(),
        remove.attributes || {},
        range,
        partial
      );
    }
    if (add) {
      range = this._addFormat(
        add.tag.toUpperCase(),
        add.attributes || {},
        range
      );
    }
    this.setSelection(range);
    this._updatePath(range, true);
    return this.focus();
  }
  code() {
    const range = this.getSelection();
    if (range.collapsed || isContainer(range.commonAncestorContainer)) {
      this.modifyBlocks((frag) => {
        const root = this._root;
        const output = document.createDocumentFragment();
        const blockWalker = getBlockWalker(frag, root);
        let node;
        while (node = blockWalker.nextNode()) {
          let nodes = node.querySelectorAll("BR");
          const brBreaksLine = [];
          let l = nodes.length;
          for (let i = 0; i < l; i += 1) {
            brBreaksLine[i] = isLineBreak(nodes[i], false);
          }
          while (l--) {
            const br = nodes[l];
            if (!brBreaksLine[l]) {
              detach(br);
            } else {
              replaceWith(br, document.createTextNode("\n"));
            }
          }
          nodes = node.querySelectorAll("CODE");
          l = nodes.length;
          while (l--) {
            replaceWith(nodes[l], empty(nodes[l]));
          }
          if (output.childNodes.length) {
            output.appendChild(document.createTextNode("\n"));
          }
          output.appendChild(empty(node));
        }
        const textWalker = new TreeIterator(output, SHOW_TEXT);
        while (node = textWalker.nextNode()) {
          node.data = node.data.replace(/ /g, " ");
        }
        output.normalize();
        return fixCursor(
          createElement("PRE", this._config.tagAttributes.pre, [
            output
          ])
        );
      }, range);
      this.focus();
    } else {
      this.changeFormat(
        {
          tag: "CODE",
          attributes: this._config.tagAttributes.code
        },
        null,
        range
      );
    }
    return this;
  }
  decreaseListLevel(range) {
    if (!range) {
      range = this.getSelection();
    }
    const root = this._root;
    const listSelection = this._getListSelection(range, root);
    if (!listSelection) {
      return this.focus();
    }
    let [list, startLi, endLi] = listSelection;
    if (!startLi) {
      startLi = list.firstChild;
    }
    if (!endLi) {
      endLi = list.lastChild;
    }
    this._recordUndoState(range, this._isInUndoState);
    let next;
    let insertBefore = null;
    if (startLi) {
      let newParent = list.parentNode;
      insertBefore = !endLi.nextSibling ? list.nextSibling : split(list, endLi.nextSibling, newParent, root);
      if (newParent !== root && newParent.nodeName === "LI") {
        newParent = newParent.parentNode;
        while (insertBefore) {
          next = insertBefore.nextSibling;
          endLi.appendChild(insertBefore);
          insertBefore = next;
        }
        insertBefore = list.parentNode.nextSibling;
      }
      const makeNotList = !/^[OU]L$/.test(newParent.nodeName);
      do {
        next = startLi === endLi ? null : startLi.nextSibling;
        list.removeChild(startLi);
        if (makeNotList && startLi.nodeName === "LI") {
          startLi = this._createDefaultBlock([empty(startLi)]);
        }
        newParent.insertBefore(startLi, insertBefore);
      } while (startLi = next);
    }
    if (!list.firstChild) {
      detach(list);
    }
    if (insertBefore) {
      mergeContainers(insertBefore);
    }

    this.setSelection(range);
    this._updatePath(range, true);
    return this.focus();
  }
  decreaseQuoteLevel(range) {
    this.modifyBlocks((frag) => {
      Array.from(frag.querySelectorAll("blockquote")).filter((el) => {
        return !getNearest(el.parentNode, frag, "BLOCKQUOTE");
      }).forEach((el) => {
        replaceWith(el, empty(el));
      });
      return frag;
    }, range);
    return this.focus();
  }
  destroy() {
    this._events.forEach((_, type) => {
      this.removeEventListener(type);
    });
    this._mutation.disconnect();
    this._undoIndex = -1;
    this._undoStack = [];
    this._undoStackLength = 0;
  }
  // --- Focus
  focus() {
    this._root.focus();
    return this;
  }
  forEachBlock(fn, mutates, range) {
    if (!range) {
      range = this.getSelection();
    }
    if (mutates) {
      this.saveUndoState(range);
    }
    const root = this._root;
    let start = getStartBlockOfRange(range, root);
    const end = getEndBlockOfRange(range, root);
    if (start && end) {
      do {
        if (fn(start) || start === end) {
          break;
        }
      } while (start = getNextBlock(start, root));
    }
    if (mutates) {
      this.setSelection(range);
      this._updatePath(range, true);
    }
    return this;
  }
  getCursorPosition() {
    const range = this.getSelection();
    let rect = range.getBoundingClientRect();
    if (rect && !rect.top) {
      this._ignoreChange = true;
      const node = createElement("SPAN");
      node.textContent = ZWS;
      insertNodeInRange(range, node, this._root);
      rect = node.getBoundingClientRect();
      const parent = node.parentNode;
      parent.removeChild(node);
      mergeInlines(parent, range);
    }
    return rect;
  }
    /**
   * Extracts the font-family and font-size (if any) of the element
   * holding the cursor. If there's a selection, returns an empty object.
   */
  getFontInfo(range) {
    const fontInfo = {
      color: void 0,
      backgroundColor: void 0,
      fontFamily: void 0,
      fontSize: void 0
    };
    if (!range) {
      range = this.getSelection();
    }
    let seenAttributes = 0;
    let element = range.commonAncestorContainer;
    if (range.collapsed || element instanceof Text) {
      if (element instanceof Text) {
        element = element.parentNode;
      }
      while (seenAttributes < 4 && element) {
        const style = element.style;
        if (style) {
          const color = style.color;
          if (!fontInfo.color && color) {
            fontInfo.color = color;
            seenAttributes += 1;
          }
          const backgroundColor = style.backgroundColor;
          if (!fontInfo.backgroundColor && backgroundColor) {
            fontInfo.backgroundColor = backgroundColor;
            seenAttributes += 1;
          }
          const fontFamily = style.fontFamily;
          if (!fontInfo.fontFamily && fontFamily) {
            fontInfo.fontFamily = fontFamily;
            seenAttributes += 1;
          }
          const fontSize = style.fontSize;
          if (!fontInfo.fontSize && fontSize) {
            fontInfo.fontSize = fontSize;
            seenAttributes += 1;
          }
        }
        element = element.parentNode;
      }
    }
    return fontInfo;
  }
  getHTML() {
    return this._getRawHTML().replace(/\u200B/g, "");
  }
  getPath() {
    return this._path;
  }
  getSelection() {
    const selection = window.getSelection();
    const root = this._root;
    let range = null;
    if (this._isFocused && selection && selection.rangeCount) {
      range = selection.getRangeAt(0).cloneRange();
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;
      if (startContainer && isLeaf(startContainer)) {
        range.setStartBefore(startContainer);
      }
      if (endContainer && isLeaf(endContainer)) {
        range.setEndBefore(endContainer);
      }
    }
    if (range && root.contains(range.commonAncestorContainer)) {
      this._lastSelection = range;
    } else {
      range = this._lastSelection;
      if (!document.contains(range.commonAncestorContainer)) {
        range = null;
      }
    }
    if (!range) {
      range = createRange(root.firstElementChild || root, 0);
    }
    return range;
  }
  getSelectedText(range) {
    return getTextContentsOfRange(range || this.getSelection());
  }
    /**
   * Looks for matching tag and attributes, so won't work if <strong>
   * instead of <b> etc.
   */
  hasFormat(tag, attributes, range) {
    tag = tag.toUpperCase();
    if (!attributes) {
      attributes = {};
    }
    if (!range) {
      range = this.getSelection();
    }
    if (!range.collapsed && range.startContainer instanceof Text && range.startOffset === range.startContainer.length && range.startContainer.nextSibling) {
      range.setStartBefore(range.startContainer.nextSibling);
    }
    if (!range.collapsed && range.endContainer instanceof Text && range.endOffset === 0 && range.endContainer.previousSibling) {
      range.setEndAfter(range.endContainer.previousSibling);
    }
    const root = this._root;
    const common = range.commonAncestorContainer;
    if (getNearest(common, root, tag, attributes)) {
      return true;
    }
    if (common instanceof Text) {
      return false;
    }
    const walker = new TreeIterator(common, SHOW_TEXT, (node2) => {
      return isNodeContainedInRange(range, node2, true);
    });
    let seenNode = false;
    let node;
    while (node = walker.nextNode()) {
      if (!getNearest(node, root, tag, attributes)) {
        return false;
      }
      seenNode = true;
    }
    return seenNode;
  }
  increaseListLevel(range) {
    if (!range) {
      range = this.getSelection();
    }
    const root = this._root;
    const listSelection = this._getListSelection(range, root);
    if (!listSelection) {
      return this.focus();
    }
    let [list, startLi, endLi] = listSelection;
    if (!startLi || startLi === list.firstChild) {
      return this.focus();
    }
    this._recordUndoState(range, this._isInUndoState);
    const type = list.nodeName;
    let newParent = startLi.previousSibling;
    let listAttrs;
    let next;
    if (newParent.nodeName !== type) {
      listAttrs = this._config.tagAttributes[type.toLowerCase()];
      newParent = createElement(type, listAttrs);
      list.insertBefore(newParent, startLi);
    }
    do {
      next = startLi === endLi ? null : startLi.nextSibling;
      newParent.appendChild(startLi);
    } while (startLi = next);
    next = newParent.nextSibling;
    if (next) {
      mergeContainers(next);
    }
    this.setSelection(range);
    this._updatePath(range, true);
    return this.focus();
  }
  increaseQuoteLevel(range) {
    this.modifyBlocks(
      (frag) => createElement(
        "BLOCKQUOTE",
        this._config.tagAttributes.blockquote,
        [frag]
      ),
      range
    );
    return this.focus();
  }
  /**
   * Insert HTML at the cursor location. If the selection is not collapsed
   * insertTreeFragmentIntoRange will delete the selection so that it is
   * replaced by the html being inserted.
   */
  insertHTML(html, isPaste) {
    const config = this._config;
    let frag = config.sanitizeToDOMFragment(html, this);
    this._stripSemantic(frag);
    const range = this.getSelection();
    this.saveUndoState(range);
    try {
      const root = this._root;
      if (config.addLinks) {
        this._addDetectedLinks(frag, frag);
      }
      cleanTree(frag, this._config);
      removeEmptyInlines(frag);
      frag.normalize();
      let node = frag;
      while (node = getNextBlock(node, frag)) {
        fixCursor(node);
      }
      let doInsert = true;
      if (isPaste) {
        const event = new CustomEvent("willPaste", {
          cancelable: true,
          detail: {
            fragment: frag
          }
        });
        this._fireEvent("willPaste", event);
        frag = event.detail.fragment;
        doInsert = !event.defaultPrevented;
      }
      if (doInsert) {
        this._insertTreeFragmentIntoRange(range, frag, root);
        range.collapse(false);
        moveRangeBoundaryOutOf(range, "A", root);
      }
      this.setSelection(range);
      this._updatePath(range, true);
      if (isPaste) {
        this.focus();
      }
    } catch (error) {
      this._config.didError(error);
    }
    return this;
  }
  insertImage(src, attributes) {
    const img = createElement(
      "IMG",
      Object.assign(
        {
          src
        },
        attributes
      )
    );
    this._insertElement(img);
    return img;
  }
  italic() {
    return this.changeFormat({ tag: "I" });
  }
  makeLink(url, attributes) {
    const range = this.getSelection();
    if (range.collapsed) {
      let protocolEnd = url.indexOf(":") + 1;
      if (protocolEnd) {
        while (url[protocolEnd] === "/") {
          protocolEnd += 1;
        }
      }
      insertNodeInRange(range, document.createTextNode(url.slice(protocolEnd)), this._root);
    }
    attributes = Object.assign({ href: url }, this._config.tagAttributes.a, attributes);
    return this.changeFormat({ tag: "A", attributes }, {tag: "A" }, range );
  }
  makeListItem() {
    const range = this.getSelection();
    let inPosition = false;
    if (this.hasFormat('ol')) {
      inPosition = true;
    }
    this.setSelection(range);
    if (!inPosition || this.hasFormat('ul')) {
      inPosition = true;
    }
    if (inPosition) {
      this.setSelection(range);
      this._insertElement(createElement('li'));
    }
    return this.focus();
  }
  makeOrderedList() {
    const ol = createElement('ol');
    ol.appendChild(createElement('li'))
    this._insertElement(ol);
//    this.modifyBlocks((frag) => this._makeList(frag, "OL"));
    return this.focus();
  }
  makeUnorderedList() {
    const ul = createElement('ol');
    ul.appendChild(createElement('li'))
    this._insertElement(ul);
//    this.modifyBlocks((frag) => this._makeList(frag, "UL"));
    return this.focus();
  }
  modifyBlocks(modify, range) {
    if (!range) {
      range = this.getSelection();
    }
    this._recordUndoState(range, this._isInUndoState);
    const root = this._root;
    expandRangeToBlockBoundaries(range, root);
    moveRangeBoundariesUpTree(range, root, root, root);
    const frag = extractContentsOfRange(range, root, root);
    if (!range.collapsed) {
      let node = range.endContainer;
      if (node === root) {
        range.collapse(false);
      } else {
        while (node.parentNode !== root) {
          node = node.parentNode;
        }
        range.setStartBefore(node);
        range.collapse(true);
      }
    }
    insertNodeInRange(range, modify.call(this, frag), this._root);
    if (range.endOffset < range.endContainer.childNodes.length) {
      mergeContainers(range.endContainer.childNodes[range.endOffset]);
    }
    mergeContainers(range.startContainer.childNodes[range.startOffset]);
    this.setSelection(range);
    this._updatePath(range, true);
    return this;
  }
  modifyDocument(modificationFn) {
    const mutation = this._mutation;
    if (mutation) {
      if (mutation.takeRecords().length) {
        this._docWasChanged();
      }
      mutation.disconnect();
    }
    this._ignoreAllChanges = true;
    modificationFn();
    this._ignoreAllChanges = false;
    if (mutation) {
      mutation.observe(this._root, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true
      });
      this._ignoreChange = false;
    }
    return this;
  }
  moveCursorToEnd() {
    return this._moveCursorTo(false);
  }
  moveCursorToStart() {
    return this._moveCursorTo(true);
  }
  redo() {
    const undoIndex = this._undoIndex;
    const undoStackLength = this._undoStackLength;
    if (undoIndex + 1 < undoStackLength && this._isInUndoState) {
      this._undoIndex += 1;
      this._setRawHTML(this._undoStack[this._undoIndex]);
      if (range) {
        this.setSelection(range);
      }
      this._fireEvent("undoStateChange", {
        canUndo: true,
        canRedo: undoIndex + 2 < undoStackLength
      });
      this._fireEvent("input");
    }
    return this.focus();
  }
  removeAllFormatting(range) {
    if (!range) {
      range = this.getSelection();
    }
    if (range.collapsed) {
      return this.focus();
    }
    const root = this._root;
    let stopNode = range.commonAncestorContainer;
    while (stopNode && !isBlock(stopNode)) {
      stopNode = stopNode.parentNode;
    }
    if (!stopNode) {
      expandRangeToBlockBoundaries(range, root);
      stopNode = root;
    }
    if (stopNode instanceof Text) {
      return this.focus();
    }
    this.saveUndoState(range);
    moveRangeBoundariesUpTree(range, stopNode, stopNode, root);
    const startContainer = range.startContainer;
    let startOffset = range.startOffset;
    const endContainer = range.endContainer;
    let endOffset = range.endOffset;
    const formattedNodes = document.createDocumentFragment();
    const cleanNodes = document.createDocumentFragment();
    const nodeAfterSplit = split(endContainer, endOffset, stopNode, root);
    let nodeInSplit = split(startContainer, startOffset, stopNode, root);
    let nextNode;
    while (nodeInSplit !== nodeAfterSplit) {
      nextNode = nodeInSplit.nextSibling;
      formattedNodes.appendChild(nodeInSplit);
      nodeInSplit = nextNode;
    }
    this._removeFormatting(formattedNodes, cleanNodes);
    cleanNodes.normalize();
    nodeInSplit = cleanNodes.firstChild;
    nextNode = cleanNodes.lastChild;
    if (nodeInSplit) {
      stopNode.insertBefore(cleanNodes, nodeAfterSplit);
      const childNodes = Array.from(stopNode.childNodes);
      startOffset = childNodes.indexOf(nodeInSplit);
      endOffset = nextNode ? childNodes.indexOf(nextNode) + 1 : 0;
    } else if (nodeAfterSplit) {
      const childNodes = Array.from(stopNode.childNodes);
      startOffset = childNodes.indexOf(nodeAfterSplit);
      endOffset = startOffset;
    }
    range.setStart(stopNode, startOffset);
    range.setEnd(stopNode, endOffset);
    mergeInlines(stopNode, range);
    moveRangeBoundariesDownTree(range);
    this.setSelection(range);
    this._updatePath(range, true);
    return this.focus();
  }

  removeBold() {
    return this.changeFormat(null, { tag: "B" });
  }
  removeCode() {
    const range = this.getSelection();
    const ancestor = range.commonAncestorContainer;
    const inPre = getNearest(ancestor, this._root, "PRE");
    if (inPre) {
      this.modifyBlocks((frag) => {
        const root = this._root;
        const pres = frag.querySelectorAll("PRE");
        let l = pres.length;
        while (l--) {
          const pre = pres[l];
          const walker = new TreeIterator(pre, SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            let value = node.data;
            value = value.replace(/ (?= )/g, "\xA0");
            const contents = document.createDocumentFragment();
            let index;
            while ((index = value.indexOf("\n")) > -1) {
              contents.appendChild(
                document.createTextNode(value.slice(0, index))
              );
              contents.appendChild(createElement("BR"));
              value = value.slice(index + 1);
            }
            node.parentNode.insertBefore(contents, node);
            node.data = value;
          }
          fixContainer(pre);
          replaceWith(pre, empty(pre));
        }
        return frag;
      }, range);
      this.focus();
    } else {
      this.changeFormat(null, { tag: "CODE" }, range);
    }
    return this;
  }
  removeEventListener(type, fn) {
    const handlers = this._events.get(type);
    let target = this._root;
    if (handlers) {
      if (fn) {
        let l = handlers.length;
        while (l--) {
          if (handlers[l] === fn) {
            handlers.splice(l, 1);
          }
        }
      } else {
        handlers.length = 0;
      }
      if (!handlers.length) {
        this._events.delete(type);
        if (!this.customEvents.has(type)) {
          if (type === "selectionchange") {
            target = document;
          }
          target.removeEventListener(type, this, true);
        }
      }
    }
    return this;
  }
  removeItalic() {
    return this.changeFormat(null, { tag: "I" });
  }
  removeLink() {
    return this.changeFormat(
      null,
      {
        tag: "A"
      },
      this.getSelection(),
      true
    );
  }
  removeList() {
    this.modifyBlocks((frag) => {
      const lists = frag.querySelectorAll("UL, OL");
      const items = frag.querySelectorAll("LI");
      const root = this._root;
      for (let i = 0, l = lists.length; i < l; i += 1) {
        const list = lists[i];
        const listFrag = empty(list);
        fixContainer(listFrag);
        replaceWith(list, listFrag);
      }
      for (let i = 0, l = items.length; i < l; i += 1) {
        const item = items[i];
        if (isBlock(item)) {
          replaceWith(item, this._createDefaultBlock([empty(item)]));
        } else {
          fixContainer(item);
          replaceWith(item, empty(item));
        }
      }
      return frag;
    });
    return this.focus();
  }
  removeStrikethrough() {
    return this.changeFormat(null, { tag: "S" });
  }
  removeSubscript() {
    return this.changeFormat(null, { tag: "SUB" });
  }
  removeSuperscript() {
    return this.changeFormat(null, { tag: "SUP" });
  }
  removeUnderline() {
    return this.changeFormat(null, { tag: "U" });
  }
  saveUndoState(range) {
    if (!range) {
      range = this.getSelection();
    }
    this._recordUndoState(range, this._isInUndoState);
    return this;
  }
  setFontFace(name) {
    const className = this._config.classNames.fontFamily;
    return this.changeFormat(
      name ? {
        tag: "SPAN",
        attributes: {
          class: className,
          style: "font-family: " + name + ", sans-serif;"
        }
      } : null,
      {
        tag: "SPAN",
        attributes: { class: className }
      }
    );
  }
  setFontSize(size) {
    const className = this._config.classNames.fontSize;
    return this.changeFormat(
      size ? {
        tag: "SPAN",
        attributes: {
          class: className,
          style: "font-size: " + (typeof size === "number" ? size + "px" : size)
        }
      } : null,
      {
        tag: "SPAN",
        attributes: { class: className }
      }
    );
  }
  setHighlightColor(color) {
    const className = this._config.classNames.highlight;
    return this.changeFormat(
      color ? {
        tag: "SPAN",
        attributes: {
          class: className,
          style: "background-color:" + color
        }
      } : null,
      {
        tag: "SPAN",
        attributes: { class: className }
      }
    );
  }
  setHTML(html) {
    const root = this._root;
    const frag = this._config.sanitizeToDOMFragment(html, this);
    this._stripSemantic(frag);
    cleanTree(frag, this._config); //removes undeeded whitespace
    fixCursor(frag);
    root.replaceChildren(...frag.childNodes);
    this._undoIndex = -1;
    this._undoStack.length = 0;
    this._undoStackLength = 0;
    this._isInUndoState = false;
    const range = createRange(root.firstElementChild || root, 0);
    this.saveUndoState(range);
    this.setSelection(range);
    this._updatePath(range, true);
    this.focus(); //seems necessary to actually see the cursor
    this.blur();
    this.focus();
    return this;
  }
  setKeyHandler(key, fn) {
    keyHandlers[key] = fn;
    return this;
  }
  setSelection(range) {
    this._lastSelection = range;
    if (!this._isFocused) {
      //this._enableRestoreSelection();
    } else {
      const selection = window.getSelection();
      if (selection) {
        if ("setBaseAndExtent" in Selection.prototype) {
          selection.setBaseAndExtent(
            range.startContainer,
            range.startOffset,
            range.endContainer,
            range.endOffset
          );
        } else {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
    return this;
  }
  setTextAlignment(alignment) {
    this.forEachBlock((block) => {
      const className = block.className.split(/\s+/).filter((klass) => {
        return !!klass && !/^align/.test(klass);
      }).join(" ");
      if (alignment) {
        block.className = className + " align-" + alignment;
        block.style.textAlign = alignment;
      } else {
        block.className = className;
        block.style.textAlign = "";
      }
    }, true);
    return this.focus();
  }
  setTextColor(color) {
    const className = this._config.classNames.color;
    return this.changeFormat(
      color ? {
        tag: "SPAN",
        attributes: {
          class: className,
          style: "color:" + color
        }
      } : null,
      {
        tag: "SPAN",
        attributes: { class: className }
      }
    );
  }
  setTextDirection(direction) {
    this.forEachBlock((block) => {
      if (direction) {
        block.dir = direction;
      } else {
        block.removeAttribute("dir");
      }
    }, true);
    return this.focus();
  }
  strikethrough() {
    return this.changeFormat({ tag: "S" });
  }
  subscript() {
    return this.changeFormat({ tag: "SUB" }, { tag: "SUP" });
  }
  superscript() {
    return this.changeFormat({ tag: "SUP" }, { tag: "SUB" });
  }
  toggleCode() {
    if (this.hasFormat("PRE") || this.hasFormat("CODE")) {
      this.removeCode();
    } else {
      this.code();
    }
    return this;
  }
  underline() {
    return this.changeFormat({ tag: "U" });
  }
  undo() {
    if (this._undoIndex !== 0 || !this._isInUndoState) {
      this._recordUndoState(this.getSelection(), false);
      this._undoIndex -= 1;
      this._setRawHTML(this._undoStack[this._undoIndex]);
      if (range) {
        this.setSelection(range);
      }
      this._isInUndoState = true;
      this._fireEvent("undoStateChange", {
        canUndo: this._undoIndex !== 0,
        canRedo: true
      });
      this._fireEvent("input");
    }
    return this.focus();
  }

  _addDetectedLinks(searchInNode) {
    const walker = new TreeIterator(
      searchInNode,
      SHOW_TEXT,
      (node2) => !getNearest(node2, this._root || this._root, "A")
    );
    const defaultAttributes = this._config.tagAttributes.a;
    let node;
    while (node = walker.nextNode()) {
      const parent = node.parentNode;
      let data = node.data;
      let match;
      while (match = linkRegExp.exec(data)) {
        const index = match.index;
        const endIndex = index + match[0].length;
        if (index) {
          parent.insertBefore(
            document.createTextNode(data.slice(0, index)),
            node
          );
        }
        const child = createElement(
          "A",
          Object.assign(
            {
              href: match[1] ? /^(?:ht|f)tps?:/i.test(match[1]) ? match[1] : "http://" + match[1] : "mailto:" + match[0]
            },
            defaultAttributes
          )
        );
        child.textContent = data.slice(index, endIndex);
        parent.insertBefore(child, node);
        node.data = data = data.slice(endIndex);
      }
    }
    return this;
  }
  _addFormat(tag, attributes, range) {
    const root = this._root;
    if (range.collapsed) {
      const el = fixCursor(createElement(tag, attributes));
      insertNodeInRange(range, el, root);
      const focusNode = el.firstChild || el;
      const focusOffset = focusNode instanceof Text ? focusNode.length : 0;
      range.setStart(focusNode, focusOffset);
      range.collapse(true);
      let block = el;
      while (isInline(block)) {
        block = block.parentNode;
      }
      removeZWS(block, el);
    } else {
      const walker = new TreeIterator(
        range.commonAncestorContainer,
        SHOW_ELEMENT_OR_TEXT,
        (node) => {
          return (node instanceof Text || node.nodeName === "BR" || node.nodeName === "IMG") && isNodeContainedInRange(range, node, true);
        }
      );
      let { startContainer, startOffset, endContainer, endOffset } = range;
      walker.currentNode = startContainer;
      if (!(startContainer instanceof Element) && !(startContainer instanceof Text) || !walker.filter(startContainer)) {
        const next = walker.nextNode();
        if (!next) {
          return range;
        }
        startContainer = next;
        startOffset = 0;
      }
      do {
        let node = walker.currentNode;
        const needsFormat = !getNearest(node, root, tag, attributes);
        if (needsFormat) {
          if (node === endContainer && node.length > endOffset) {
            node.splitText(endOffset);
          }
          if (node === startContainer && startOffset) {
            node = node.splitText(startOffset);
            if (endContainer === startContainer) {
              endContainer = node;
              endOffset -= startOffset;
            } else if (endContainer === startContainer.parentNode) {
              endOffset += 1;
            }
            startContainer = node;
            startOffset = 0;
          }
          const el = createElement(tag, attributes);
          replaceWith(node, el);
          el.appendChild(node);
        }
      } while (walker.nextNode());
      range = createRange(
        startContainer,
        startOffset,
        endContainer,
        endOffset
      );
    }
    return range;
  }


  _beforeInput(event) {
    switch (event.inputType) {
      case "insertLineBreak":
        event.preventDefault();
        this._splitBlock(true);
        break;
      case "insertParagraph":
        event.preventDefault();
        this._splitBlock(false);
        break;
      case "insertOrderedList":
        event.preventDefault();
        this.makeOrderedList();
        break;
      case "insertUnoderedList":
        event.preventDefault();
        this.makeUnorderedList();
        break;
      case "historyUndo":
        event.preventDefault();
        this.undo();
        break;
      case "historyRedo":
        event.preventDefault();
        this.redo();
        break;
      case "formatBold":
        event.preventDefault();
        this.bold();
        break;
      case "formaItalic":
        event.preventDefault();
        this.italic();
        break;
      case "formatUnderline":
        event.preventDefault();
        this.underline();
        break;
      case "formatStrikeThrough":
        event.preventDefault();
        this.strikethrough();
        break;
      case "formatSuperscript":
        event.preventDefault();
        this.superscript();
        break;
      case "formatSubscript":
        event.preventDefault();
        this.subscript();
        break;
      case "formatJustifyFull":
      case "formatJustifyCenter":
      case "formatJustifyRight":
      case "formatJustifyLeft": {
        event.preventDefault();
        let alignment = event.inputType.slice(13).toLowerCase();
        if (alignment === "full") {
          alignment = "justify";
        }
        this.setTextAlignment(alignment);
        break;
      }
      case "formatRemove":
        event.preventDefault();
        this.removeAllFormatting();
        break;
      case "formatSetBlockTextDirection": {
        event.preventDefault();
        let dir = event.data;
        if (dir === "null") {
          dir = null;
        }
        this.setTextDirection(dir);
        break;
      }
      case "formatBackColor":
        event.preventDefault();
        this.setHighlightColor(event.data);
        break;
      case "formatFontColor":
        event.preventDefault();
        this.setTextColor(event.data);
        break;
      case "formatFontName":
        event.preventDefault();
        this.setFontFace(event.data);
        break;
    }
  }

  _cleanupBRs(node, keepForBlankLine) {
    /*
      AKC 08 Jul 2024  I have no idea what the purpose of this function is.  So until I do am going to patch it to do nothing.  Then
      if I discover what its for I can change it again
    */
    
    /*const brs = node.querySelectorAll("BR");
    const brBreaksLine = [];
    let l = brs.length;
    for (let i = 0; i < l; i += 1) {
      brBreaksLine[i] = isLineBreak(brs[i], keepForBlankLine);
    }
    while (l--) {
      const br = brs[l];
      const parent = br.parentNode;
      if (!parent) {
        continue;
      }
      if (!brBreaksLine[l]) {
        detach(br);
      } else if (!isInline(parent)) {
        fixContainer(parent);
      }
    }
    */
  }
  _createDefaultBlock(children) {
    const config = this._config;
    return fixCursor(
      createElement(config.blockTag, config.blockAttributes, children)
    );
  }
  _disableRestoreSelection() {
    this._willRestoreSelection = false;
  }
  _docWasChanged() {
    resetNodeCategoryCache();
    this._mayHaveZWS = true;
    if (this._ignoreAllChanges) {
      return;
    }
    if (this._ignoreChange) {
      this._ignoreChange = false;
      return;
    }
    if (this._isInUndoState) {
      this._isInUndoState = false;
      this._fireEvent("undoStateChange", {
        canUndo: true,
        canRedo: false
      });
    }
    this._fireEvent("input");
  }
  _enableRestoreSelection() {
    this._willRestoreSelection = true;
  }
  _ensureBottomLine() {
    const root = this._root;
    const last = root.lastElementChild;
    if (!last || last.nodeName !== this._config.blockTag || !isBlock(last)) {
      root.appendChild(this._createDefaultBlock());
    }
  }
  _fireEvent(type, detail) {
    let handlers = this._events.get(type);
    if (/^(?:focus|blur)/.test(type)) {
      //AKC 13 Jul 2024  the previous code just used document.activeElement.  That doesn't work with shadowRoots
      let activeElement = document.activeElement;
      if (activeElement !== null) {
        //there is an active element in a shadowRoot lets find it
        while (activeElement.shadowRoot) {
          const newActiveElement = activeElement.shadowRoot.activeElement;
          if (newActiveElement === null) break;
          activeElement = newActiveElement;
        }
      }
      const isFocused = this._root === activeElement;
      if (type === "focus") {
        if (!isFocused || this._isFocused) {
          return this;
        }
        this._isFocused = true;
      } else {
        if (isFocused || !this._isFocused) {
          return this;
        }
        this._isFocused = false;
      }
    }
    if (handlers) {
      const event = detail instanceof Event ? detail : new CustomEvent(type, {
        detail
      });
      handlers = handlers.slice();
      for (const handler of handlers) {
        try {
          if ("handleEvent" in handler) {
            handler.handleEvent(event);
          } else {
            handler.call(this, event);
          }
        } catch (error) {
          this._config.didError(error);
        }
      }
    }
    return this;
  }
   _getListSelection(range, root) {
    let list = range.commonAncestorContainer;
    let startLi = range.startContainer;
    let endLi = range.endContainer;
    while (list && list !== root && !/^[OU]L$/.test(list.nodeName)) {
      list = list.parentNode;
    }
    if (!list || list === root) {
      return null;
    }
    if (startLi === list) {
      startLi = startLi.childNodes[range.startOffset];
    }
    if (endLi === list) {
      endLi = endLi.childNodes[range.endOffset];
    }
    while (startLi && startLi.parentNode !== list) {
      startLi = startLi.parentNode;
    }
    while (endLi && endLi.parentNode !== list) {
      endLi = endLi.parentNode;
    }
    return [list, startLi, endLi];
  }
  _getPath(node) {
    const root = this._root;
    const config = this._config;
    let path = "";
    if (node && node !== root) {
      const parent = node.parentNode;
      path = parent ? this._getPath(parent) : "";
      if (node instanceof HTMLElement) {
        const id = node.id;
        const classList = node.classList;
        const classNames = Array.from(classList).sort();
        const dir = node.dir;
        const styleNames = config.classNames;
        path += (path ? ">" : "") + node.nodeName;
        if (id) {
          path += "#" + id;
        }
        if (classNames.length) {
          path += ".";
          path += classNames.join(".");
        }
        if (dir) {
          path += "[dir=" + dir + "]";
        }
        if (classList.contains(styleNames.highlight)) {
          path += "[backgroundColor=" + node.style.backgroundColor.replace(/ /g, "") + "]";
        }
        if (classList.contains(styleNames.color)) {
          path += "[color=" + node.style.color.replace(/ /g, "") + "]";
        }
        if (classList.contains(styleNames.fontFamily)) {
          path += "[fontFamily=" + node.style.fontFamily.replace(/ /g, "") + "]";
        }
        if (classList.contains(styleNames.fontSize)) {
          path += "[fontSize=" + node.style.fontSize + "]";
        }
      }
    }
    return path;
  }

    _getRawHTML() {
    return this._root.innerHTML;
  }

  // --- Events
  handleEvent(event) {
    this._fireEvent(event.type, event);
  }
  _insertElement(el, range) {
    if (!range) {
      range = this.getSelection();
    }
    range.collapse(true);
    insertNodeInRange(range,el, this._root);
    range.setStart(el, 0);
    range.setEnd(el, 0);
    this.setSelection(range);
    this._updatePath(range);
    return this;
  }

  _insertPlainText(plainText, isPaste) {
    const range = this.getSelection();
    if (range.collapsed && getNearest(range.startContainer, this._root, "PRE")) {
      const startContainer = range.startContainer;
      let offset = range.startOffset;
      let textNode;
      if (!startContainer || !(startContainer instanceof Text)) {
        const text = document.createTextNode("");
        startContainer.insertBefore(
          text,
          startContainer.childNodes[offset]
        );
        textNode = text;
        offset = 0;
      } else {
        textNode = startContainer;
      }
      let doInsert = true;
      if (isPaste) {
        const event = new CustomEvent("willPaste", {
          cancelable: true,
          detail: {
            text: plainText
          }
        });
        this._fireEvent("willPaste", event);
        plainText = event.detail.text;
        doInsert = !event.defaultPrevented;
      }
      if (doInsert) {
        textNode.insertData(offset, plainText);
        range.setStart(textNode, offset + plainText.length);
        range.collapse(true);
      }
      this.setSelection(range);
      return this;
    }
    const lines = plainText.split("\n");
    const config = this._config;
    const tag = config.blockTag;
    const attributes = config.blockAttributes;
    const closeBlock = "</" + tag + ">";
    let openBlock = "<" + tag;
    for (const attr in attributes) {
      openBlock += " " + attr + '="' + escapeHTML(attributes[attr]) + '"';
    }
    openBlock += ">";
    for (let i = 0, l = lines.length; i < l; i += 1) {
      let line = lines[i];
      line = escapeHTML(line).replace(/ (?=(?: |$))/g, "&nbsp;");
      if (i) {
        line = openBlock + (line || "<BR>") + closeBlock;
      }
      lines[i] = line;
    }
    return this.insertHTML(lines.join(""), isPaste);
  }
  _linkifyText(textNode, offset) {
    if (getNearest(textNode, this._root, "A")) {
      return;
    }
    const data = textNode.data || "";
    const searchFrom = Math.max(
      data.lastIndexOf(" ", offset - 1),
      data.lastIndexOf("\xA0", offset - 1)
    ) + 1;
    const searchText = data.slice(searchFrom, offset);
    const match = linkRegExp.exec(searchText);
    if (match) {
      const selection = this.getSelection();
      this._docWasChanged();
      this._recordUndoState(selection);
      const index = searchFrom + match.index;
      const endIndex = index + match[0].length;
      const needsSelectionUpdate = selection.startContainer === textNode;
      const newSelectionOffset = selection.startOffset - endIndex;
      if (index) {
        textNode = textNode.splitText(index);
      }
      const defaultAttributes = this._config.tagAttributes.a;
      const link = createElement(
        "A",
        Object.assign(
          {
            href: match[1] ? /^(?:ht|f)tps?:/i.test(match[1]) ? match[1] : "http://" + match[1] : "mailto:" + match[0]
          },
          defaultAttributes
        )
      );
      link.textContent = data.slice(index, endIndex);
      textNode.parentNode.insertBefore(link, textNode);
      textNode.data = data.slice(endIndex);
      if (needsSelectionUpdate) {
        selection.setStart(textNode, newSelectionOffset);
        selection.setEnd(textNode, newSelectionOffset);
      }
      this.setSelection(selection);
    }
  };
  _makeConfig(userConfig) {
    const config = {
      blockTag: "DIV",
      blockAttributes: null,
      tagAttributes: {},
      classNames: {
        color: "color",
        fontFamily: "font",
        fontSize: "size",
        highlight: "highlight"
      },
      undo: {
        documentSizeThreshold: -1,
        // -1 means no threshold
        undoLimit: -1
        // -1 means no limit
      },
      addLinks: true,
      willCutCopy: null,
      toPlainText: null,
      keepLineBreaks: false, //AKC 08 Jun 2024 NOT SURE WHY YOU WOULD REMOVE LINE BREAKS, but the code does the so lets make it configurable
      sanitizeToDOMFragment: (html) => {
        return DOMPurify.sanitize(html, {USE_PROFILES: {html:true}, KEEP_CONTENT: false, RETURN_DOM_FRAGMENT: true, 
          FORBID_TAGS:['area','audio','body','dialog','dir','font','frameset','fencedframe','head','html','iframe','map','marque','meta','object','portal',
          'slot','source','template','track','video','xmp']});
      },
      didError: (error) => console.log(error)
    };
    if (userConfig) {
      Object.assign(config, userConfig);
      config.blockTag = config.blockTag.toUpperCase();
    }
    return config;
  }
  _makeList(frag, type) {
    const walker = getBlockWalker(frag, this._root);
    const tagAttributes = this._config.tagAttributes;
    const listAttrs = tagAttributes[type.toLowerCase()];
    const listItemAttrs = tagAttributes.li;
    let node;
    while (node = walker.nextNode()) {
      if (node.parentNode instanceof HTMLLIElement) {
        node = node.parentNode;
        walker.currentNode = node.lastChild;
      }
      if (!(node instanceof HTMLLIElement)) {
        const newLi = createElement("LI", listItemAttrs);
        if (node.dir) {
          newLi.dir = node.dir;
        }
        const prev = node.previousSibling;
        if (prev && prev.nodeName === type) {
          prev.appendChild(newLi);
          detach(node);
        } else {
          replaceWith(node, createElement(type, listAttrs, [newLi]));
        }
        newLi.appendChild(empty(node));
        walker.currentNode = newLi;
      } else {
        node = node.parentNode;
        const tag = node.nodeName;
        if (tag !== type && /^[OU]L$/.test(tag)) {
          replaceWith(
            node,
            createElement(type, listAttrs, [empty(node)])
          );
        }
      }
    }
    return frag;
  }
  _moveCursorTo(toStart) {
    const root = this._root;
    const range = createRange(root, toStart ? 0 : root.childNodes.length);
    moveRangeBoundariesDownTree(range);
    this.setSelection(range);
    return this;
  }
  _recordUndoState(range, replace) {
    const isInUndoState = this._isInUndoState;
    if (!isInUndoState || replace) {
      let undoIndex = this._undoIndex + 1;
      const undoStack = this._undoStack;
      const undoConfig = this._config.undo;
      const undoThreshold = undoConfig.documentSizeThreshold;
      const undoLimit = undoConfig.undoLimit;
      if (undoIndex < this._undoStackLength) {
        undoStack.length = this._undoStackLength = undoIndex;
      }
      if (isInUndoState) {
        return this;
      }
      const html = this._getRawHTML();
      if (replace) {
        undoIndex -= 1;
      }
      if (undoThreshold > -1 && html.length * 2 > undoThreshold) {
        if (undoLimit > -1 && undoIndex > undoLimit) {
          undoStack.splice(0, undoIndex - undoLimit);
          undoIndex = undoLimit;
          this._undoStackLength = undoLimit;
        }
      }
      undoStack[undoIndex] = html;
      this._undoIndex = undoIndex;
      this._undoStackLength += 1;
      this._isInUndoState = true;
    }
    return this;
  }
  _removeFormat(tag, attributes, range, partial) {

    let fixer;
    if (range.collapsed) {
      if (cantFocusEmptyTextNodes) {
        fixer = document.createTextNode(ZWS);
      } else {
        fixer = document.createTextNode("");
      }
      insertNodeInRange(range, fixer, this._root);
    }
    let root = range.commonAncestorContainer;
    while (isInline(root)) {
      root = root.parentNode;
    }
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    const toWrap = [];
    const examineNode = (node, exemplar) => {
      if (isNodeContainedInRange(range, node, false)) {
        return;
      }
      let child;
      let next;
      if (!isNodeContainedInRange(range, node, true)) {
        if (!(node instanceof HTMLInputElement) && (!(node instanceof Text) || node.data)) {
          toWrap.push([exemplar, node]);
        }
        return;
      }
      if (node instanceof Text) {
        if (node === endContainer && endOffset !== node.length) {
          toWrap.push([exemplar, node.splitText(endOffset)]);
        }
        if (node === startContainer && startOffset) {
          node.splitText(startOffset);
          toWrap.push([exemplar, node]);
        }
      } else {
        for (child = node.firstChild; child; child = next) {
          next = child.nextSibling;
          examineNode(child, exemplar);
        }
      }
    };
    const formatTags = Array.from(
      root.getElementsByTagName(tag)
    ).filter((el) => {
      return isNodeContainedInRange(range, el, true) && hasTagAttributes(el, tag, attributes);
    });
    if (!partial) {
      formatTags.forEach((node) => {
        examineNode(node, node);
      });
    }
    toWrap.forEach(([el, node]) => {
      el = el.cloneNode(false);
      replaceWith(node, el);
      el.appendChild(node);
    });
    formatTags.forEach((el) => {
      replaceWith(el, empty(el));
    });
    if (cantFocusEmptyTextNodes && fixer) {
      fixer = fixer.parentNode;
      let block = fixer;
      while (block && isInline(block)) {
        block = block.parentNode;
      }
      if (block) {
        removeZWS(block, fixer);
      }
    }
    if (fixer) {
      range.collapse(false);
    }
    mergeInlines(root, range);
    return range;
  }
  _removeFormatting(root, clean) {
    for (let node = root.firstChild, next; node; node = next) {
      next = node.nextSibling;
      if (isInline(node)) {
        if (node instanceof Text || node.nodeName === "BR" || node.nodeName === "IMG") {
          clean.appendChild(node);
          continue;
        }
      } else if (isBlock(node)) {
        clean.appendChild(
          this._createDefaultBlock([
            this._removeFormatting(
              node,
              document.createDocumentFragment()
            )
          ])
        );
        continue;
      }
      this._removeFormatting(node, clean);
    }
    return clean;
  }
  _removeQuote(range) {
    this.modifyBlocks(() => {}, range );
    return this.focus();
  }
  _removeZWS() {
    if (!this._mayHaveZWS) {
      return;
    }
    removeZWS(this._root);
    this._mayHaveZWS = false;
  }
  _restoreSelection() {
    if (this._willRestoreSelection) {
      this.setSelection(this._lastSelection);
    }
  }
  _setRawHTML(html) {
    const root = this._root;
    root.innerHTML = html;
    let node = root;
    const child = node.firstChild;
    if (!child ) {
      const block = this._createDefaultBlock();
      if (child) {
        node.replaceChild(block, child);
      } else {
        node.appendChild(block);
      }
    } else {
      while (node = getNextBlock(node, root)) {
        fixCursor(node);
      }
    }
    this._ignoreChange = true;
    return this;
  }
  _splitBlock(lineBreakOnly, range) {
    if (!range) {
      range = this.getSelection();
    }
    const root = this._root;
    let block;
    let parent;
    let node;
    let nodeAfterSplit;
    this._recordUndoState(range);
    this._removeZWS();
    if (!range.collapsed) {
      if (lineBreakOnly) {
        const newNode = createElement('P');
        range.surroundContents(newNode);
        return;
      } else {
        deleteContentsOfRange(range, root);
      }
    }
    if (this._config.addLinks) {
      moveRangeBoundariesDownTree(range);
      const textNode = range.startContainer;
      const offset2 = range.startOffset;
      setTimeout(() => {
        this._linkifyText(textNode, offset2);
      }, 0);
    }
    block = getStartBlockOfRange(range, root);
    if (block && (parent = getNearest(block, root, "PRE"))) {
      moveRangeBoundariesDownTree(range);
      node = range.startContainer;
      const offset2 = range.startOffset;
      if (!(node instanceof Text)) {
        node = document.createTextNode("");
        parent.insertBefore(node, parent.firstChild);
      }
      if (!lineBreakOnly && node instanceof Text && (node.data.charAt(offset2 - 1) === "\n" || rangeDoesStartAtBlockBoundary(range, root)) && (node.data.charAt(offset2) === "\n" || rangeDoesEndAtBlockBoundary(range, root))) {
        node.deleteData(offset2 && offset2 - 1, offset2 ? 2 : 1);
        nodeAfterSplit = split(
          node,
          offset2 && offset2 - 1,
          root,
          root
        );
        node = nodeAfterSplit.previousSibling;
        if (!node.textContent) {
          detach(node);
        }
        node = this._createDefaultBlock();
        nodeAfterSplit.parentNode.insertBefore(node, nodeAfterSplit);
        if (!nodeAfterSplit.textContent) {
          detach(nodeAfterSplit);
        }
        range.setStart(node, 0);
      } else {
        node.insertData(offset2, "\n");
        fixCursor(parent);
        if (node.length === offset2 + 1) {
          range.setStartAfter(node);
        } else {
          range.setStart(node, offset2 + 1);
        }
      }
      range.collapse(true);
      this.setSelection(range);
      this._updatePath(range, true);
      this._docWasChanged();
      return this;
    }
    if (!block || lineBreakOnly || /^T[HD]$/.test(block.nodeName)) {
      moveRangeBoundaryOutOf(range, "A", root);
      insertNodeInRange(range, (!block && !lineBreakOnly) ? createElement("P") : createElement("BR"), root);
      range.collapse(false);
      this.setSelection(range);
      this._updatePath(range, true);
      return this;
    }
    if (parent = getNearest(block, root, "LI")) {
      block = parent;
    }
    if (isEmptyBlock(block)) {
      if (getNearest(block, root, "UL") || getNearest(block, root, "OL")) {
        this.decreaseListLevel(range);
        return this;
      } else if (getNearest(block, root, "BLOCKQUOTE")) {
        this._removeQuote(range);
        return this;
      }
    }
    node = range.startContainer;
    const offset = range.startOffset;
    let splitTag = tagAfterSplit[block.nodeName];
    nodeAfterSplit = split(
      node,
      offset,
      block.parentNode,
      this._root
    );
    const config = this._config;
    let splitProperties = null;
    if (!splitTag) {
      splitTag = config.blockTag;
      splitProperties = config.blockAttributes;
    }
    if (!hasTagAttributes(nodeAfterSplit, splitTag, splitProperties)) {
      block = createElement(splitTag, splitProperties);
      if (nodeAfterSplit.dir) {
        block.dir = nodeAfterSplit.dir;
      }
      replaceWith(nodeAfterSplit, block);
      block.appendChild(empty(nodeAfterSplit));
      nodeAfterSplit = block;
    }
    removeZWS(block);
    removeEmptyInlines(block);
    fixCursor(block);
    while (nodeAfterSplit instanceof Element) {
      let child = nodeAfterSplit.firstChild;
      let next;
      if (nodeAfterSplit.nodeName === "A" && (!nodeAfterSplit.textContent || nodeAfterSplit.textContent === ZWS)) {
        child = document.createTextNode("");
        replaceWith(nodeAfterSplit, child);
        nodeAfterSplit = child;
        break;
      }
      while (child && child instanceof Text && !child.data) {
        next = child.nextSibling;
        if (!next || next.nodeName === "BR") {
          break;
        }
        detach(child);
        child = next;
      }
      if (!child || child.nodeName === "BR" || child instanceof Text) {
        break;
      }
      nodeAfterSplit = child;
    }
    range = createRange(nodeAfterSplit, 0);
    this.setSelection(range);
    this._updatePath(range, true);
    return this;
  }
  _stripSemantic(frag) {

    //this function works the complete tree from root downwards and if a semantic element is found (div, section etc).
    //Then its children are move up a level
    const walker = document.createTreeWalker(frag,NodeFilter.SHOW_ELEMENT + NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (isSemantic(node, this._config.blockTag)) {
        const parent = node.parentNode;
        if (parent?.tagName?.toUpperCase() === 'P') {
          let child;
          while (child = node.lastChild) {
            parent.insertBefore(child, node);
          }
          node.remove();
          this._stripSemantic(parent); //do parent again
        } else {
          const p = document.createElement("p")
          Array.from(node.childNodes).forEach(child => p.appendChild(child));
          node.replaceWith(p);
          this._stripSemantic(p); //do this new node as it wont't be picked up by the walker
        }
      }
    }
  
  }
  _updatePath(range, force) {
    const anchor = range.startContainer;
    const focus = range.endContainer;
    let newPath;
    if (force || anchor !== this._lastAnchorNode || focus !== this._lastFocusNode) {
      this._lastAnchorNode = anchor;
      this._lastFocusNode = focus;
      newPath = anchor && focus ? anchor === focus ? this._getPath(focus) : "(selection)" : "";
      if (this._path !== newPath) {
        this._path = newPath;
        this._fireEvent("pathChange", {
          path: newPath
        });
      }
    }
    this._fireEvent(range.collapsed ? "cursor" : "select", {
      range
    });
  }
  _updatePathOnEvent() {
    if (this._isFocused) {
      this._updatePath(this.getSelection());
    }
  }
};

