import { getAssistantReply } from './assistant-core.js';

class SystemAssistant {
  constructor() {
    this.container = null;
    this.openBtn = null;
    this.panel = null;
    this.messages = null;
    this.input = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    if (document.getElementById('systemAssistantContainer')) return;

    this.container = document.createElement('div');
    this.container.id = 'systemAssistantContainer';
    this.container.className = 'system-assistant-shell';

    const isDeanPage = /(^\/dean(?:\/|$)|\/dean-dashboard(?:\.html)?$)/i.test(window.location.pathname)
      || document.title.toLowerCase().includes('dean');
    if (isDeanPage) {
      this.container.classList.add('assistant-right');
    }

    this.container.innerHTML = `
      <button id="systemAssistantToggle" class="system-assistant-toggle" title="Open system assistant">
        <i class="fas fa-comments"></i>
      </button>
      <div id="systemAssistantPanel" class="system-assistant-panel hidden">
        <div class="system-assistant-header">
          <div class="system-assistant-title-wrap">
            <div class="system-assistant-avatar">AI</div>
            <div>
              <h4>CompetenceHub Assistant</h4>
              <div class="system-assistant-status">
                <span class="system-assistant-status-dot"></span>
                <span>Online now</span>
              </div>
            </div>
          </div>
          <button id="systemAssistantClose" class="system-assistant-close" aria-label="Close assistant">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div id="systemAssistantMessages" class="system-assistant-messages"></div>
        <div class="system-assistant-suggestions">
          <button class="system-assistant-suggestion" data-question="What is this system?">What is this system?</button>
          <button class="system-assistant-suggestion" data-question="What features does it offer?">What features does it offer?</button>
          <button class="system-assistant-suggestion" data-question="How do I get started?">How do I get started?</button>
        </div>
        <div class="system-assistant-input-row">
          <input id="systemAssistantInput" type="text" placeholder="Ask about the system..." />
          <button id="systemAssistantSend"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.openBtn = document.getElementById('systemAssistantToggle');
    this.panel = document.getElementById('systemAssistantPanel');
    this.messages = document.getElementById('systemAssistantMessages');
    this.input = document.getElementById('systemAssistantInput');

    this.openBtn.addEventListener('click', () => this.toggle());
    document.getElementById('systemAssistantClose').addEventListener('click', () => this.close());
    document.getElementById('systemAssistantSend').addEventListener('click', () => this.handleSend());
    document.querySelectorAll('.system-assistant-suggestion').forEach((button) => {
      button.addEventListener('click', () => this.handleSuggestedQuestion(button.dataset.question));
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.handleSend();
      }
    });

    this.showTypingIndicator();
    setTimeout(() => {
      this.removeTypingIndicator();
      this.addMessage('Hello! I can answer general questions about the system and help you get started quickly.', 'bot');
    }, 700);
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('hidden', !this.isOpen);
    this.openBtn.classList.toggle('active', this.isOpen);
    if (this.isOpen) {
      this.input.focus();
    }
  }

  close() {
    this.isOpen = false;
    this.panel.classList.add('hidden');
    this.openBtn.classList.remove('active');
  }

  addMessage(text, sender = 'bot') {
    const message = document.createElement('div');
    message.className = `system-assistant-message ${sender === 'user' ? 'user' : 'bot'}`;
    if (sender === 'bot') {
      message.innerHTML = text;
    } else {
      message.textContent = text;
    }
    this.messages.appendChild(message);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  showTypingIndicator() {
    this.removeTypingIndicator();
    const indicator = document.createElement('div');
    indicator.id = 'systemAssistantTyping';
    indicator.className = 'system-assistant-message bot system-assistant-typing';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    this.messages.appendChild(indicator);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  removeTypingIndicator() {
    const indicator = document.getElementById('systemAssistantTyping');
    if (indicator) indicator.remove();
  }

  handleSuggestedQuestion(question) {
    this.input.value = question;
    this.handleSend();
  }

  handleSend() {
    const question = this.input.value.trim();
    if (!question) return;
    this.addMessage(question, 'user');
    this.input.value = '';

    this.showTypingIndicator();
    const reply = getAssistantReply(question, {
      pageName: document.title || 'CBC Portal',
      activeTab: document.querySelector('.menu li.active')?.dataset.tab || ''
    });

    setTimeout(() => {
      this.removeTypingIndicator();
      this.addMessage(reply, 'bot');
    }, 240);
  }
}

window.SystemAssistant = SystemAssistant;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.systemAssistant = new SystemAssistant();
  });
} else {
  window.systemAssistant = new SystemAssistant();
}
