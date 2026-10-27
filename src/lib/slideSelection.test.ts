import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { slideScript } from './slideSeek'
let frame: Window
let messages: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  frame = new Window()
  frame.document.body.innerHTML = '<div id="deck" data-deck-id="deck" data-width="1280" data-height="720"><div data-slide><h1>Title</h1><p>Support</p><img src="test.png"><video></video></div></div>'
  messages = vi.spyOn(frame, 'postMessage').mockImplementation(() => {})
  frame.eval(slideScript(0, 0).replace(/^<script>|<\/script>$/g, ''))
  message({ type: 'pureslides:picking', on: true })
  messages.mockClear()
})
afterEach(async () => { await frame.happyDOM.close() })
function message(data: object) { frame.dispatchEvent(new frame.MessageEvent('message', {data})) }
function click(selector: string, shiftKey = false) {
  frame.document.querySelector(selector)!.dispatchEvent(new frame.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey }))
}
function highlight(path = '0') { message({type:'pureslides:highlight',paths:[path],slide:0,scale:1}) }
it('selects an element on the first click and keeps Shift-click additive on selected text', () => {
  click('h1')
  expect(messages).toHaveBeenLastCalledWith(expect.objectContaining({type:'pureslides:picked',path:'0',additive:false}), '*')
  highlight()
  click('h1', true)
  expect(messages).toHaveBeenLastCalledWith(expect.objectContaining({type:'pureslides:picked',path:'0',additive:true}), '*')
  expect(frame.document.querySelector('h1')!.hasAttribute('contenteditable')).toBe(false)
})
it('clears on blank canvas and Escape without selecting the slide container', () => {
  click('[data-slide]')
  expect(messages).toHaveBeenLastCalledWith({type:'pureslides:clear-selection'}, '*')
  frame.document.dispatchEvent(new frame.KeyboardEvent('keydown', {key:'Escape',bubbles:true}))
  expect(messages.mock.calls.filter(([data]) => (data as { type: string }).type === 'pureslides:clear-selection')).toHaveLength(2)
})
it('edits selected text on a second plain click, commits on blur, and omits selection markup', () => {
  highlight()
  click('h1')
  const heading = frame.document.querySelector('h1')!
  expect(heading.getAttribute('contenteditable')).toBe('true')
  heading.textContent = 'New title'
  heading.dispatchEvent(new frame.Event('blur'))
  expect(messages).toHaveBeenLastCalledWith({type:'pureslides:edited',slideIndex:0,path:'0',outerHtml:'<h1>New title</h1>'}, '*')
})
it('Escape cancels text editing before a subsequent Escape clears selection', () => {
  highlight()
  click('h1')
  frame.document.querySelector('h1')!.textContent = 'Not saved'
  frame.document.dispatchEvent(new frame.KeyboardEvent('keydown', {key:'Escape',bubbles:true}))
  expect(frame.document.querySelector('h1')!.textContent).toBe('Title')
  expect(frame.document.querySelector('h1')!.classList.contains('__pv-picked')).toBe(true)
  expect(messages.mock.calls.some(([data]) => (data as { type: string }).type === 'pureslides:edited' || (data as { type: string }).type === 'pureslides:clear-selection')).toBe(false)
})
it('does not enable text editing on media or intercept presentation clicks', () => {
  highlight('3')
  click('video')
  expect(frame.document.querySelector('video')!.hasAttribute('contenteditable')).toBe(false)
  message({type:'pureslides:picking',on:false})
  messages.mockClear()
  click('h1')
  expect(messages).not.toHaveBeenCalled()
})
