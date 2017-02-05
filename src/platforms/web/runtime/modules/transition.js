/* @flow */

import { inBrowser, isIE9 } from 'core/util/index'
import { once } from 'shared/util'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { activeInstance } from 'core/instance/lifecycle'
import {
  resolveTransition,
  nextFrame,
  addTransitionClass,
  removeTransitionClass,
  whenTransitionEnds,
  parseDuration
} from '../transition-util'

export function enter (vnode: VNodeWithData, toggleDisplay: ?() => void) {
  const el: any = vnode.elm

  // call leave callback now
  if (el._leaveCb) {
    el._leaveCb.cancelled = true
    el._leaveCb()
  }

  const data = resolveTransition(vnode.data.transition)
  if (!data) {
    return
  }

  /* istanbul ignore if */
  if (el._enterCb || el.nodeType !== 1) {
    return
  }

  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration
  } = data

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.
  let context = activeInstance
  let transitionNode = activeInstance.$vnode
  while (transitionNode && transitionNode.parent) {
    transitionNode = transitionNode.parent
    context = transitionNode.context
  }

  const isAppear = !context._isMounted || !vnode.isRootInsert

  if (isAppear && !appear && appear !== '') {
    return
  }

  const startClass = isAppear ? appearClass : enterClass
  const activeClass = isAppear ? appearActiveClass : enterActiveClass
  const toClass = isAppear ? appearToClass : enterToClass

  const beforeEnterHook = isAppear ? (beforeAppear || beforeEnter) : beforeEnter
  const enterHook = isAppear ? (typeof appear === 'function' ? appear : enter) : enter
  const afterEnterHook = isAppear ? (afterAppear || afterEnter) : afterEnter
  const enterCancelledHook = isAppear ? (appearCancelled || enterCancelled) : enterCancelled

  const explicitDuration = parseDuration((
      duration !== null &&
      typeof duration === 'object' &&
      duration.enter
    ) || duration)

  const expectsCSS = css !== false && !isIE9
  const userWantsControl =
    enterHook &&
    // enterHook may be a bound method which exposes
    // the length of original fn as _length
    (enterHook._length || enterHook.length) > 1

  const cb = el._enterCb = once(() => {
    if (expectsCSS) {
      removeTransitionClass(el, toClass)
      removeTransitionClass(el, activeClass)
    }
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, startClass)
      }
      enterCancelledHook && enterCancelledHook(el)
    } else {
      afterEnterHook && afterEnterHook(el)
    }
    el._enterCb = null
  })

  if (!vnode.data.show) {
    // remove pending leave element on enter by injecting an insert hook
    mergeVNodeHook(vnode.data.hook || (vnode.data.hook = {}), 'insert', () => {
      const parent = el.parentNode
      const pendingNode = parent && parent._pending && parent._pending[vnode.key]
      if (pendingNode &&
          pendingNode.tag === vnode.tag &&
          pendingNode.elm._leaveCb) {
        pendingNode.elm._leaveCb()
      }
      enterHook && enterHook(el, cb)
    }, 'transition-insert')
  }

  // start enter transition
  beforeEnterHook && beforeEnterHook(el)
  if (expectsCSS) {
    addTransitionClass(el, startClass)
    addTransitionClass(el, activeClass)
    nextFrame(() => {
      addTransitionClass(el, toClass)
      removeTransitionClass(el, startClass)
      if (!cb.cancelled && !userWantsControl) {
        if (typeof explicitDuration !== 'undefined') {
          setTimeout(cb, explicitDuration)
        } else {
          whenTransitionEnds(el, type, cb)
        }
      }
    })
  }

  if (vnode.data.show) {
    toggleDisplay && toggleDisplay()
    enterHook && enterHook(el, cb)
  }

  if (!expectsCSS && !userWantsControl) {
    cb()
  }
}

export function leave (vnode: VNodeWithData, rm: Function) {
  const el: any = vnode.elm

  // call enter callback now
  if (el._enterCb) {
    el._enterCb.cancelled = true
    el._enterCb()
  }

  const data = resolveTransition(vnode.data.transition)
  if (!data) {
    return rm()
  }

  /* istanbul ignore if */
  if (el._leaveCb || el.nodeType !== 1) {
    return
  }

  const {
    css,
    type,
    leaveClass,
    leaveToClass,
    leaveActiveClass,
    beforeLeave,
    leave,
    afterLeave,
    leaveCancelled,
    delayLeave,
    duration
  } = data

  const expectsCSS = css !== false && !isIE9
  const userWantsControl =
    leave &&
    // leave hook may be a bound method which exposes
    // the length of original fn as _length
    (leave._length || leave.length) > 1

  const explicitDuration = parseDuration((
      duration !== null &&
      typeof duration === 'object' &&
      duration.leave
    ) || duration)

  const cb = el._leaveCb = once(() => {
    if (el.parentNode && el.parentNode._pending) {
      el.parentNode._pending[vnode.key] = null
    }
    if (expectsCSS) {
      removeTransitionClass(el, leaveToClass)
      removeTransitionClass(el, leaveActiveClass)
    }
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, leaveClass)
      }
      leaveCancelled && leaveCancelled(el)
    } else {
      rm()
      afterLeave && afterLeave(el)
    }
    el._leaveCb = null
  })

  if (delayLeave) {
    delayLeave(performLeave)
  } else {
    performLeave()
  }

  function performLeave () {
    // the delayed leave may have already been cancelled
    if (cb.cancelled) {
      return
    }
    // record leaving element
    if (!vnode.data.show) {
      (el.parentNode._pending || (el.parentNode._pending = {}))[vnode.key] = vnode
    }
    beforeLeave && beforeLeave(el)
    if (expectsCSS) {
      addTransitionClass(el, leaveClass)
      addTransitionClass(el, leaveActiveClass)
      nextFrame(() => {
        addTransitionClass(el, leaveToClass)
        removeTransitionClass(el, leaveClass)
        if (!cb.cancelled && !userWantsControl) {
          if (typeof explicitDuration !== 'undefined') {
            setTimeout(cb, explicitDuration)
          } else {
            whenTransitionEnds(el, type, cb)
          }
        }
      })
    }
    leave && leave(el, cb)
    if (!expectsCSS && !userWantsControl) {
      cb()
    }
  }
}

function _enter (_: any, vnode: VNodeWithData) {
  if (!vnode.data.show) {
    enter(vnode)
  }
}

export default inBrowser ? {
  create: _enter,
  activate: _enter,
  remove (vnode: VNode, rm: Function) {
    /* istanbul ignore else */
    if (!vnode.data.show) {
      leave(vnode, rm)
    } else {
      rm()
    }
  }
} : {}
