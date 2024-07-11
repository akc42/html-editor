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

import { isWin, isGecko, isLegacyEdge, notWS } from './constants.js';
import { createElement, detach } from './node.js';
import { createRange, deleteContentsOfRange, getStartBlockOfRange, getEndBlockOfRange,getTextContentsOfRange, moveRangeBoundariesDownTree,
  moveRangeBoundariesUpTree } from './range.js';

const indexOf = Array.prototype.indexOf;

export function _onCopy(event) {
  extractRangeToClipboard(
    event,
    this.getSelection(),
    this._root,
    false,
    this._config.willCutCopy,
    this._config.toPlainText,
    false
  );
};
export function _onCut(event) {
  const range = this.getSelection();
  const root = this._root;
  if (range.collapsed) {
    event.preventDefault();
    return;
  }
  this.saveUndoState(range);
  const handled = extractRangeToClipboard(
    event,
    range,
    root,
    true,
    this._config.willCutCopy,
    this._config.toPlainText,
    false
  );
  if (!handled) {
    setTimeout(() => {
      try {
        this._ensureBottomLine();
      } catch (error) {
        this._config.didError(error);
      }
    }, 0);
  }
  this.setSelection(range);
};
export function _onDrop(event) {
  if (!event.dataTransfer) {
    return;
  }
  const types = event.dataTransfer.types;
  let l = types.length;
  let hasPlain = false;
  let hasHTML = false;
  while (l--) {
    switch (types[l]) {
      case "text/plain":
        hasPlain = true;
        break;
      case "text/html":
        hasHTML = true;
        break;
      default:
        return;
    }
  }
  if (hasHTML || hasPlain && self.saveUndoState) {
    this.saveUndoState();
  }
};
export function _onPaste(event) {
  const clipboardData = event.clipboardData;
  const items = clipboardData?.items;
  const choosePlain = this._isShiftDown;
  let hasRTF = false;
  let hasImage = false;
  let plainItem = null;
  let htmlItem = null;
  if (items) {
    let l = items.length;
    while (l--) {
      const item = items[l];
      const type = item.type;
      if (type === "text/html") {
        htmlItem = item;
      } else if (type === "text/plain" || type === "text/uri-list") {
        plainItem = item;
      } else if (type === "text/rtf") {
        hasRTF = true;
      } else if (/^image\/.*/.test(type)) {
        hasImage = true;
      }
    }
    if (hasImage && !(hasRTF && htmlItem)) {
      event.preventDefault();
      this._fireEvent("pasteImage", {
        clipboardData
      });
      return;
    }
    if (!isLegacyEdge) {
      event.preventDefault();
      if (htmlItem && (!choosePlain || !plainItem)) {
        htmlItem.getAsString((html) => {
          this.insertHTML(html, true);
        });
      } else if (plainItem) {
        plainItem.getAsString((text) => {
          let isLink = false;
          const range2 = this.getSelection();
          if (!range2.collapsed && notWS.test(range2.toString())) {
            const match = this.linkRegExp.exec(text);
            isLink = !!match && match[0].length === text.length;
          }
          if (isLink) {
            this.makeLink(text);
          } else {
            this._insertPlainText(text, true);
          }
        });
      }
      return;
    }
  }
  const types = clipboardData?.types;
  if (!isLegacyEdge && types && (indexOf.call(types, "text/html") > -1 || !isGecko && indexOf.call(types, "text/plain") > -1 && indexOf.call(types, "text/rtf") < 0)) {
    event.preventDefault();
    let data;
    if (!choosePlain && (data = clipboardData.getData("text/html"))) {
      this.insertHTML(data, true);
    } else if ((data = clipboardData.getData("text/plain")) || (data = clipboardData.getData("text/uri-list"))) {
      this._insertPlainText(data, true);
    }
    return;
  }
  const body = document.body;
  const range = this.getSelection();
  const startContainer = range.startContainer;
  const startOffset = range.startOffset;
  const endContainer = range.endContainer;
  const endOffset = range.endOffset;
  let pasteArea = createElement("DIV", {
    contenteditable: "true",
    style: "position:fixed; overflow:hidden; top:0; right:100%; width:1px; height:1px;"
  });
  body.appendChild(pasteArea);
  range.selectNodeContents(pasteArea);
  this.setSelection(range);
  setTimeout(() => {
    try {
      let html = "";
      let next = pasteArea;
      let first;
      while (pasteArea = next) {
        next = pasteArea.nextSibling;
        detach(pasteArea);
        first = pasteArea.firstChild;
        if (first && first === pasteArea.lastChild && first instanceof HTMLDivElement) {
          pasteArea = first;
        }
        html += pasteArea.innerHTML;
      }
      this.setSelection(
        createRange(
          startContainer,
          startOffset,
          endContainer,
          endOffset
        )
      );
      if (html) {
        this.insertHTML(html, true);
      }
    } catch (error) {
      this._config.didError(error);
    }
  }, 0);
};


export function extractRangeToClipboard(event, range, root, removeRangeFromDocument, toCleanHTML, toPlainText, plainTextOnly) {
  const clipboardData = event.clipboardData;
  if (isLegacyEdge || !clipboardData) {
    return false;
  }
  let text = toPlainText ? "" : getTextContentsOfRange(range);
  const startBlock = getStartBlockOfRange(range, root);
  const endBlock = getEndBlockOfRange(range, root);
  let copyRoot = root;
  if (startBlock === endBlock && startBlock?.contains(range.commonAncestorContainer)) {
    copyRoot = startBlock;
  }
  let contents;
  if (removeRangeFromDocument) {
    contents = deleteContentsOfRange(range, root);
  } else {
    range = range.cloneRange();
    moveRangeBoundariesDownTree(range);
    moveRangeBoundariesUpTree(range, copyRoot, copyRoot, root);
    contents = range.cloneContents();
  }
  let parent = range.commonAncestorContainer;
  if (parent instanceof Text) {
    parent = parent.parentNode;
  }
  while (parent && parent !== copyRoot) {
    const newContents = parent.cloneNode(false);
    newContents.appendChild(contents);
    contents = newContents;
    parent = parent.parentNode;
  }
  let html;
  if (contents.childNodes.length === 1 && contents.childNodes[0] instanceof Text) {
    text = contents.childNodes[0].data.replace(/ /g, " ");
    plainTextOnly = true;
  } else {
    const node = createElement("DIV");
    node.appendChild(contents);
    html = node.innerHTML;
    if (toCleanHTML) {
      html = toCleanHTML(html);
    }
  }
  if (toPlainText && html !== void 0) {
    text = toPlainText(html);
  }
  if (isWin) {
    text = text.replace(/\r?\n/g, "\r\n");
  }
  if (!plainTextOnly && html && text !== html) {
    clipboardData.setData("text/html", html);
  }
  clipboardData.setData("text/plain", text);
  event.preventDefault();
  return true;
};
