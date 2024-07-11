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

import { ZWS, cantFocusEmptyTextNodes } from './constants.js';
import { createElement, getNearest, areAlike, getLength, detach, empty } from './node.js';
import { isInline, isContainer } from './range.js';

export function fixContainer(container) {
  /*
    This purpose of this function is to tidy up html which  contains overlapping 
  */


  if(isContainer(container)) return container;
  let wrapper = null; //AKC 08 Jul 2024 REWROTE and moved to outside function
  const children = Array.from(container.childNodes);
  let i = 0;
  for(i = 0; i < children.length; i++) {
    if (!isInline(children[i])) break;
    if(!wrapper) wrapper = createElement('div');
    wrapper.append(children[i]);
  }
  if(wrapper) {
    if(!isContainer(wrapper)) throw new Error('initial wrapper should be a container'); //note this check is primarily to cache wrapper as a container
    container.prepend(wrapper)
    wrapper = null;
  }
  for(let j = children.length -1; j > i; j--) {
    if (!isInline(children[j])) break
    if (!wrapper) wrapper = createElement('div')
    wrapper.prepend(children[j])
  }
  if(wrapper) {
    if (!isContainer(wrapper)) throw new Error('final wrapper should be a container'); //note this check is primarily to cache wrapper as a container
    container.append(wrapper)
  }
  return container;
}

export function fixCursor(node) {
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
export function mergeContainers(node) {
  log('merge containers method');
  const prev = node.previousSibling;
  const first = node.firstChild;
  const isListItem = node.nodeName === "LI";
  if (isListItem && (!first || !/^[OU]L$/.test(first.nodeName))) {
    return;
  }
  if (prev && areAlike(prev, node)) {
    if (!isContainer(prev)) {
      if (isListItem) {
        const block = createElement(this.config.blockTag);
        block.appendChild(empty(prev));
        prev.appendChild(block);
      } else {
        return;
      }
    }
    detach(node);
    const needsFix = !isContainer(node);
    prev.appendChild(empty(node));
    if (needsFix) {
      fixContainer(prev);
    }
    if (first) {
      mergeContainers(first);
    }
  } else if (isListItem) {
    const block = createElement(this.config.blockTag);
    node.insertBefore(block, first);
    fixCursor(block);
  }
}

function _mergeInlines(node, fakeRange) {
  const children = node.childNodes;
  let l = children.length;
  const frags = [];
  while (l--) {
    const child = children[l];
    const prev = l ? children[l - 1] : null;
    if (prev && isInline(child) && areAlike(child, prev)) {
      if (fakeRange.startContainer === child) {
        fakeRange.startContainer = prev;
        fakeRange.startOffset += getLength(prev);
      }
      if (fakeRange.endContainer === child) {
        fakeRange.endContainer = prev;
        fakeRange.endOffset += getLength(prev);
      }
      if (fakeRange.startContainer === node) {
        if (fakeRange.startOffset > l) {
          fakeRange.startOffset -= 1;
        } else if (fakeRange.startOffset === l) {
          fakeRange.startContainer = prev;
          fakeRange.startOffset = getLength(prev);
        }
      }
      if (fakeRange.endContainer === node) {
        if (fakeRange.endOffset > l) {
          fakeRange.endOffset -= 1;
        } else if (fakeRange.endOffset === l) {
          fakeRange.endContainer = prev;
          fakeRange.endOffset = getLength(prev);
        }
      }
      detach(child);
      if (child instanceof Text) {
        prev.appendData(child.data);
      } else {
        frags.push(empty(child));
      }
    } else if (child instanceof Element) {
      let frag;
      while (frag = frags.pop()) {
        child.appendChild(frag);
      }
      _mergeInlines(child, fakeRange);
    }
  }
};
export function mergeInlines(node, range) {
  const element = node instanceof Text ? node.parentNode : node;
  if (element instanceof Element) {
    const fakeRange = {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset
    };
    _mergeInlines(element, fakeRange);
    range.setStart(fakeRange.startContainer, fakeRange.startOffset);
    range.setEnd(fakeRange.endContainer, fakeRange.endOffset);
  }
};
export function mergeWithBlock(block, next, range, root) {
  let container = next;
  let parent;
  let offset;
  while ((parent = container.parentNode) && parent !== root && parent instanceof Element && parent.childNodes.length === 1) {
    container = parent;
  }
  detach(container);
  offset = block.childNodes.length;
  const last = block.lastChild;
  if (last && last.nodeName === "BR") {
    block.removeChild(last);
    offset -= 1;
  }
  block.appendChild(empty(next));
  range.setStart(block, offset);
  range.collapse(true);
  mergeInlines(block, range);
};

export function split(node, offset, stopNode, root) {
  if (node instanceof Text && node !== stopNode) {
    if (typeof offset !== "number") {
      throw new Error("Offset must be a number to split text node!");
    }
    if (!node.parentNode) {
      throw new Error("Cannot split text node with no parent!");
    }
    return split(node.parentNode, node.splitText(offset), stopNode, root);
  }
  let nodeAfterSplit = typeof offset === "number" ? offset < node.childNodes.length ? node.childNodes[offset] : null : offset;
  const parent = node.parentNode;
  if (!parent || node === stopNode || !(node instanceof Element)) {
    return nodeAfterSplit;
  }
  const clone = node.cloneNode(false);
  while (nodeAfterSplit) {
    const next = nodeAfterSplit.nextSibling;
    clone.appendChild(nodeAfterSplit);
    nodeAfterSplit = next;
  }
  if (node instanceof HTMLOListElement && getNearest(node, root, "BLOCKQUOTE")) {
    clone.start = (+node.start || 1) + node.childNodes.length - 1;
  }
  fixCursor(node);
  fixCursor(clone);
  parent.insertBefore(clone, node.nextSibling);
  return split(parent, clone, stopNode, root);
};
