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

import { ZWS, ctrlKey, isMac, isIOS,isWin } from './constants.js';
import { getNextBlock, getPreviousBlock, isInline, isBlock } from './block.js';
import { mergeWithBlock } from './mergesplit.js';
import { detach, getNearest} from './node.js';
import { deleteContentsOfRange, getStartBlockOfRange,   moveRangeBoundariesDownTree, moveRangeBoundariesUpTree, rangeDoesStartAtBlockBoundary, 
        rangeDoesEndAtBlockBoundary } from './range.js';
import { fixCursor } from './whitespace.js';

function _ArrowLeft() {
  this._removeZWS()
};
function _ArrowRight(event, range) {
  const root = this._root;
  this._removeZWS();
  if (rangeDoesEndAtBlockBoundary(range, root)) {
    moveRangeBoundariesDownTree(range);
    let node = range.endContainer;
    do {
      if (node.nodeName === "CODE") {
        let next = node.nextSibling;
        if (!(next instanceof Text)) {
          const textNode = document.createTextNode("\xA0");
          node.parentNode.insertBefore(textNode, next);
          next = textNode;
        }
        range.setStart(next, 1);
        this.setSelection(range);
        event.preventDefault();
        break;
      }
    } while (!node.nextSibling && (node = node.parentNode) && node !== root);
  }
};
export function _Backspace(event, range) {
    const root = this._root;
    this._removeZWS();
    this.saveUndoState(range);
    if (!range.collapsed) {
      event.preventDefault();
      deleteContentsOfRange(range, root);
      afterDelete(this,range);
    } else if (rangeDoesStartAtBlockBoundary(range, root)) {
      event.preventDefault();
      const startBlock = getStartBlockOfRange(range, root);
      if (!startBlock) {
        return;
      }
      let current = startBlock;
      const previous = getPreviousBlock(current, root);
      if (previous) {
        if (!previous.isContentEditable) {
          detachUneditableNode(previous, root);
          return;
        }
        mergeWithBlock(previous, current, range, root);
        current = previous.parentNode;
        while (current !== root && !current.nextSibling) {
          current = current.parentNode;
        }
        if (current !== root && (current = current.nextSibling)) {
          this._mergeContainers(current);
        }
        this.setSelection(range);
      } else if (current) {
        if (getNearest(current, root, "UL") || getNearest(current, root, "OL")) {
          this.decreaseListLevel(range);
          return;
        } else if (getNearest(current, root, "BLOCKQUOTE")) {
          this._removeQuote(range);
          return;
        }
        this.setSelection(range);
        this._updatePath(range, true);
      }
    } else {
      moveRangeBoundariesDownTree(range);
      const text = range.startContainer;
      const offset = range.startOffset;
      const a = text.parentNode;
      if (text instanceof Text && a instanceof HTMLAnchorElement && offset && a.href.includes(text.data)) {
        text.deleteData(offset - 1, 1);
        this.setSelection(range);
        this.removeLink();
        event.preventDefault();
      } else {
        this.setSelection(range);
        setTimeout(() => {
          afterDelete(this);
        }, 0);
      }
    }
  };
  function _CloseBracket(event) {
    event.preventDefault();
    const path = this.getPath();
    if (/(?:^|>)BLOCKQUOTE/.test(path) || !/(?:^|>)[OU]L/.test(path)) {
      this.increaseQuoteLevel();
    } else {
      this.increaseListLevel();
    }
  };
  function _ControlD(event) {
    event.preventDefault();
    this.toggleCode();
  };
  
  function _ControlY(event) {
    event.preventDefault();
    this.redo();
  };
  function _ControlZ(event)  {
    event.preventDefault();
    this.undo();
  };
  
  export function _Delete(event, range) {
    const root = this._root;
    let current;
    let next;
    let originalRange;
    let cursorContainer;
    let cursorOffset;
    let nodeAfterCursor;
    this._removeZWS();
    this.saveUndoState(range);
    if (!range.collapsed) {
      event.preventDefault();
      deleteContentsOfRange(range, root);
      afterDelete(this,range);
    } else if (rangeDoesEndAtBlockBoundary(range, root)) {
      event.preventDefault();
      current = getStartBlockOfRange(range, root);
      if (!current) {
        return;
      }
      next = getNextBlock(current, root);
      if (next) {
        if (!next.isContentEditable) {
          detachUneditableNode(next, root);
          return;
        }
        mergeWithBlock(current, next, range, root);
        next = current.parentNode;
        while (next !== root && !next.nextSibling) {
          next = next.parentNode;
        }
        if (next !== root && (next = next.nextSibling)) {
          this._mergeContainers(next);
        }
        this.setSelection(range);
        this._updatePath(range, true);
      }
    } else {
      originalRange = range.cloneRange();
      moveRangeBoundariesUpTree(range, root, root, root);
      cursorContainer = range.endContainer;
      cursorOffset = range.endOffset;
      if (cursorContainer instanceof Element) {
        nodeAfterCursor = cursorContainer.childNodes[cursorOffset];
        if (nodeAfterCursor && nodeAfterCursor.nodeName === "IMG") {
          event.preventDefault();
          detach(nodeAfterCursor);
          moveRangeBoundariesDownTree(range);
          afterDelete(this,range);
          return;
        }
      }
      this.setSelection(originalRange);
      setTimeout(() => {
        afterDelete(this);
      }, 0);
    }
  };
  export function _Enter(event, range) {
    event.preventDefault();
    this._splitBlock(event.shiftKey, range);
  };
  export function _monitorShiftKey(event) {
    this._isShiftDown = event.shiftKey;
  };
  export function _onKey(event) {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    let key = event.key;
    let modifiers = "";
    const code = event.code;
    if (/^Digit\d$/.test(code)) {
      key = code.slice(-1);
    }
    if (key !== "Backspace" && key !== "Delete") {
      if (event.altKey) {
        modifiers += "Alt-";
      }
      if (event.ctrlKey) {
        modifiers += "Ctrl-";
      }
      if (event.metaKey) {
        modifiers += "Meta-";
      }
      if (event.shiftKey) {
        modifiers += "Shift-";
      }
    }
    if (isWin && event.shiftKey && key === "Delete") {
      modifiers += "Shift-";
    }
    key = modifiers + key;
    const range = this.getSelection();
    if (keyHandlers[key]) {
      keyHandlers[key].call(this, event, range);
    } else if (!range.collapsed && !event.ctrlKey && !event.metaKey && key.length === 1) {
      this.saveUndoState(range);
      deleteContentsOfRange(range, this._root);
      this.setSelection(range);
      this._updatePath(range, true);
    }
  };
  function _OpenBracket(event) {
    event.preventDefault();
    const path = this.getPath();
    if (/(?:^|>)BLOCKQUOTE/.test(path) || !/(?:^|>)[OU]L/.test(path)) {
      this.decreaseQuoteLevel();
    } else {
      this.decreaseListLevel();
    }
  };
  function _PageDown() {
    this.moveCursorToEnd();
  };
  function _PageUp() {
    this.moveCursorToStart();
  };
  function _Shift8(event) {
    event.preventDefault();
    const path = this.getPath();
    if (!/(?:^|>)UL/.test(path)) {
      this.makeUnorderedList();
    } else {
      this.removeList();
    }
  };
  function _Shift9(event) {
    event.preventDefault();
    const path = this.getPath();
    if (!/(?:^|>)OL/.test(path)) {
      this.makeOrderedList();
    } else {
      this.removeList();
    }
  };
  function _ShiftTab(event, range) {
    const root = this._root;
    this._removeZWS();
    if (range.collapsed && rangeDoesStartAtBlockBoundary(range, root)) {
      const node = range.startContainer;
      if (getNearest(node, root, "UL") || getNearest(node, root, "OL")) {
        event.preventDefault();
        this.decreaseListLevel(range);
      }
    }
  };
  function _Space( event, range) {
    const root = this._root;
    this._recordUndoState(range);
    this._getRangeAndRemoveBookmark(range);
    if (!range.collapsed) {
      deleteContentsOfRange(range, root);
      this.setSelection(range);
      this._updatePath(range, true);
    } else if (rangeDoesEndAtBlockBoundary(range, root)) {
      const block = getStartBlockOfRange(range, root);
      if (block && block.nodeName !== "PRE") {
        const text = block.textContent?.trimEnd().replace(ZWS, "");
        if (text === "*" || text === "1.") {
          event.preventDefault();
          this._insertPlainText(" ", false);
          this._docWasChanged();
          this.saveUndoState(range);
          const walker = new TreeIterator(block, SHOW_TEXT);
          let textNode;
          while (textNode = walker.nextNode()) {
            detach(textNode);
          }
          if (text === "*") {
            this.makeUnorderedList();
          } else {
            this.makeOrderedList();
          }
          return;
        }
      }
    }
    let node = range.endContainer;
    if (range.endOffset === getLength(node)) {
      do {
        if (node.nodeName === "A") {
          range.setStartAfter(node);
          break;
        }
      } while (!node.nextSibling && (node = node.parentNode) && node !== root);
    }
    if (this._config.addLinks) {
      const linkRange = range.cloneRange();
      moveRangeBoundariesDownTree(linkRange);
      const textNode = linkRange.startContainer;
      const offset = linkRange.startOffset;
      setTimeout(() => {
        this._linkifyText(textNode, offset);
      }, 0);
    }
    this.setSelection(range);
  };
  function _Tab(event, range) {
    const root = this._root;
    this._removeZWS();
    if (range.collapsed && rangeDoesStartAtBlockBoundary(range, root)) {
      let node = getStartBlockOfRange(range, root);
      let parent;
      while (parent = node.parentNode) {
        if (parent.nodeName === "UL" || parent.nodeName === "OL") {
          event.preventDefault();
          this.increaseListLevel(range);
          break;
        }
        node = parent;
      }
    }
  };
  function afterDelete(self,range) {
    try {
      if (!range) {
        range = self.getSelection();
      }
      let node = range.startContainer;
      if (node instanceof Text) {
        node = node.parentNode;
      }
      let parent = node;
      while (isInline(parent) && (!parent.textContent || parent.textContent === ZWS)) {
        node = parent;
        parent = node.parentNode;
      }
      if (node !== parent) {
        range.setStart(
          parent,
          Array.from(parent.childNodes).indexOf(node)
        );
        range.collapse(true);
        parent.removeChild(node);
        if (!isBlock(parent)) {
          parent = getPreviousBlock(parent, self._root) || self._root;
        }
        fixCursor(parent);
        moveRangeBoundariesDownTree(range);
      }
      if (node === self._root && (node = node.firstChild) && node.nodeName === "BR") {
        detach(node);
      }
      self.setSelection(range);
      self._updatePath(range, true);
    } catch (error) {
      self._config.didError(error);
    }
  };
  function detachUneditableNode(node, root) {
    let parent;
    while (parent = node.parentNode) {
      if (parent === root || parent.isContentEditable) {
        break;
      }
      node = parent;
    }
    detach(node);
  };
  export const keyHandlers = {
    "Backspace": _Backspace,
    "Delete": _Delete,
    "Enter": _Enter,
    "Shift-Enter": _Enter,
    "Tab": _Tab,
    "Shift-Tab": _ShiftTab,
    " ": _Space,
    "ArrowLeft": _ArrowLeft,
    "ArrowRight": _ArrowRight,
    [ctrlKey + "b"]:  mapKeyToFormat("B"),
    [ctrlKey + "i"]:  mapKeyToFormat("I"),
    [ctrlKey + "u"]:  mapKeyToFormat("U"),
    [ctrlKey + "Shift-7"]:  mapKeyToFormat("S"),
    [ctrlKey + "Shift-5"]:  mapKeyToFormat("SUB", { tag: "SUP" }),
    [ctrlKey + "Shift-6"]:  mapKeyToFormat("SUP", { tag: "SUB" }),
    [ctrlKey + "Shift-8"]:  _Shift8,
    [ctrlKey + "Shift-9"] : _Shift9,
    [ctrlKey + "["]: _OpenBracket,
    [ctrlKey + "]"]: _CloseBracket,
    [ctrlKey + "d"]: _ControlD,
    [ctrlKey + "z"]: _ControlZ,
    [ctrlKey + "y"]: _ControlY,
    // Depending on platform, the Shift may cause the key to come through as
    // upper case, but sometimes not. Just add both as shortcuts — the browser
    // will only ever fire one or the other.
    [ctrlKey + "Shift-z"]: _ControlY,
    [ctrlKey + "Shift-Z"]: _ControlY
  }
  if (!isMac && !isIOS) {
    keyHandlers.PageUp = _PageUp;
    keyHandlers.PageDown = _PageDown;
  }
  

  function mapKeyToFormat(tag, remove) {
    remove = remove || null;
    return (event) => {
      event.preventDefault();
      const range = self.getSelection();
      if (this.hasFormat(tag, null, range)) {
        this.changeFormat(null, { tag }, range);
      } else {
        this.changeFormat({ tag }, remove, range);
      }
    };
  };