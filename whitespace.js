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

import { ZWS, notWS, cantFocusEmptyTextNodes } from './constants.js';
import { isInline } from './block.js';
import { getLength } from './node.js';
import { SHOW_ELEMENT_OR_TEXT, SHOW_TEXT, TreeIterator } from './tree.js';

export function fixCursor(node) {
  /*
    This function aim is to make sure that every block level tag has either more block tags or some white space
  */

  if (node instanceof Text) {
    return node;
  }
  if (isInline(node)) {
    let child = node.firstChild;
    if (cantFocusEmptyTextNodes) {
      while (child && child instanceof Text && !child.data) {
        node.removeChild(child);
        child = node.firstChild;
      }
    }
    if (!child) {
      let fixer;
      if (cantFocusEmptyTextNodes) {
        fixer = document.createTextNode(ZWS);
      } else {
        fixer = document.createTextNode("");
      }
      if (fixer) {
        try {
          node.appendChild(fixer);
        } catch (error) {
        }
      }
    }
  }
  return node;
};

export function isLineBreak(br, isLBIfEmptyBlock) {
  let block = br.parentNode;
  while (isInline(block)) {
    block = block.parentNode;
  }
  const walker = new TreeIterator(
    block,
    SHOW_ELEMENT_OR_TEXT,
    notWSTextNode
  );
  walker.currentNode = br;
  return !!walker.nextNode() || isLBIfEmptyBlock && !walker.previousNode();
};
function notWSTextNode(node) {
  return node instanceof Element ? node.nodeName === "BR" : (
    // okay if data is 'undefined' here.
    notWS.test(node.data)
  );
};
export function removeZWS(root, keepNode) {
  const walker = new TreeIterator(root, SHOW_TEXT);
  let textNode;
  let index;
  while (textNode = walker.nextNode()) {
    while ((index = textNode.data.indexOf(ZWS)) > -1 && // eslint-disable-next-line no-unmodified-loop-condition
    (!keepNode || textNode.parentNode !== keepNode)) {
      if (textNode.length === 1) {
        let node = textNode;
        let parent = node.parentNode;
        while (parent) {
          parent.removeChild(node);
          walker.currentNode = parent;
          if (!isInline(parent) || getLength(parent)) {
            break;
          }
          node = parent;
          parent = node.parentNode;
        }
        break;
      } else {
        textNode.deleteData(index, 1);
      }
    }
  }
};
