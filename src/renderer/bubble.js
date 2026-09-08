const bubbleApp = document.getElementById('bubbleApp');
const bubbleText = document.getElementById('bubbleText');

window.buddy.onBubbleText((text) => {
  bubbleText.textContent = text;
});

window.buddy.onBubbleSide((side) => {
  bubbleApp.classList.remove('tail-left', 'tail-right');
  bubbleApp.classList.add(side === 'left' ? 'tail-left' : 'tail-right');
});
