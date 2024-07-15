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

import { TreeIterator, SHOW_ELEMENT } from './tree.js';
import { DOCUMENT_FRAGMENT_NODE, ELEMENT_NODE,TEXT_NODE, notWS } from './constants.js';
const UNKNOWN = 0;
const INLINE = 1;
const BLOCK = 2;
const CONTAINER = 3;



const inlineNodeNames = /^(?:#text|A(?:BBR|CRONYM)?|B(?:R|D[IO])?|C(?:ITE|ODE)|D(?:ATA|EL|FN)|EM|FONT|HR|I(?:FRAME|MG|NPUT|NS)?|KBD|Q|R(?:P|T|UBY)|S(?:AMP|MALL|PAN|TR(?:IKE|ONG)|U[BP])?|TIME|U|const|WBR)$/;
const leafNodeNames = /* @__PURE__ */ new Set(["BR", "HR", "IFRAME", "IMG", "INPUT"]);

let cache = /* @__PURE__ */ new WeakMap();


export function getBlockWalker(node, root) {
  const walker = new TreeIterator(root, SHOW_ELEMENT, isBlock);
  walker.currentNode = node;
  return walker;
};
export function getNextBlock(node, root) {
  const block = getBlockWalker(node, root).nextNode();
  return block !== root ? block : null;
};
function getNodeCategory(node) {
  switch (node.nodeType) {
    case TEXT_NODE:
      return INLINE;
    case ELEMENT_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      if (cache.has(node)) {
        return cache.get(node);
      }
      break;
    default:
      return UNKNOWN;
  }
  let nodeCategory;
  if (!Array.from(node.childNodes).every(isInline)) {
    nodeCategory = CONTAINER;
  } else if (inlineNodeNames.test(node.nodeName)) {
    nodeCategory = INLINE;
  } else {
    nodeCategory = BLOCK;
  }
  cache.set(node, nodeCategory);
  return nodeCategory;
};
export function getPreviousBlock(node, root) {
  const block = getBlockWalker(node, root).previousNode();
  return block !== root ? block : null;
};

export function isBlock(node) {
  return getNodeCategory(node) === BLOCK;
};
export function isContainer(node) {
  return getNodeCategory(node) === CONTAINER;
};
export function isContent (node) {
  return node instanceof Text ? notWS.test(node.data) : node.nodeName === "IMG";
};
export function isEmptyBlock(block) {
  return !block.textContent && !block.querySelector("IMG");
};
export function isInline(node) {
  return getNodeCategory(node) === INLINE;
};
export function isLeaf (node) {
  return leafNodeNames.has(node.nodeName);
};
export function resetNodeCategoryCache () {
  cache = /* @__PURE__ */ new WeakMap();
};