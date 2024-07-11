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
export const SHOW_ELEMENT = 1;
export const SHOW_TEXT = 4;
export const SHOW_ELEMENT_OR_TEXT = 5;
function always() {
  return true;
};
export class TreeIterator {
  constructor(root, nodeType, filter) {
    this.root = root;
    this.currentNode = root;
    this.nodeType = nodeType;
    this.filter = filter || always;
  }
  isAcceptableNode(node) {
    const nodeType = node.nodeType;
    const nodeFilterType = nodeType === Node.ELEMENT_NODE ? SHOW_ELEMENT : nodeType === Node.TEXT_NODE ? SHOW_TEXT : 0;
    return !!(nodeFilterType & this.nodeType) && this.filter(node);
  }
  nextNode() {
    const root = this.root;
    let current = this.currentNode;
    let node;
    while (true) {
      node = current.firstChild;
      while (!node && current) {
        if (current === root) {
          break;
        }
        node = current.nextSibling;
        if (!node) {
          current = current.parentNode;
        }
      }
      if (!node) {
        return null;
      }
      if (this.isAcceptableNode(node)) {
        this.currentNode = node;
        return node;
      }
      current = node;
    }
  }
  previousNode() {
    const root = this.root;
    let current = this.currentNode;
    let node;
    while (true) {
      if (current === root) {
        return null;
      }
      node = current.previousSibling;
      if (node) {
        while (current = node.lastChild) {
          node = current;
        }
      } else {
        node = current.parentNode;
      }
      if (!node) {
        return null;
      }
      if (this.isAcceptableNode(node)) {
        this.currentNode = node;
        return node;
      }
      current = node;
    }
  }
  // Previous node in post-order.
  previousPONode() {
    const root = this.root;
    let current = this.currentNode;
    let node;
    while (true) {
      node = current.lastChild;
      while (!node && current) {
        if (current === root) {
          break;
        }
        node = current.previousSibling;
        if (!node) {
          current = current.parentNode;
        }
      }
      if (!node) {
        return null;
      }
      if (this.isAcceptableNode(node)) {
        this.currentNode = node;
        return node;
      }
      current = node;
    }
  }
};