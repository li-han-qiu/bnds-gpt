document.addEventListener('DOMContentLoaded', function() {

    // ---------- DOM 引用 ----------
    const messagesContainer = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    const conversationList = document.getElementById('conversationList');
    const newChatBtn = document.getElementById('newChatBtn');

    // 侧边栏折叠按钮
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('sidebar');

    let currentConversationId = null;

    // ---------- 动态问候语 ----------
    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 6) return '夜深了，注意休息哦 🌙';
        if (hour < 12) return '早上好！今天有什么想了解的？☀️';
        if (hour < 18) return '下午好！有什么能帮你的？📚';
        return '晚上好！学习一天辛苦了 🌟';
    }

    // ---------- 侧边栏折叠 ----------
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('sidebar-collapsed');
            this.textContent = sidebar.classList.contains('sidebar-collapsed') ? '▶' : '☰';
        });
    }

    // ---------- 核心函数 ----------

    // 添加消息到界面（打字机效果）
    function appendMessage(type, text, isTypingEffect = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = type === 'user' ? '👤' : '🤖';
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = text;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);
        
        messagesContainer.insertBefore(messageDiv, typingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (type === 'user' || !isTypingEffect) {
            // 用户消息或历史消息：直接显示全部
            bubble.textContent = text;
        } else {
            // AI 回复：逐字输出
            bubble.textContent = '';
            let index = 0;
            const interval = setInterval(() => {
                if (index < text.length) {
                    bubble.textContent += text[index];
                    index++;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else {
                    clearInterval(interval);
                }
            }, 15); // 15ms一个字，可调节
        }
    }
    

    // 加载所有对话列表
    async function loadConversations() {
        const response = await fetch('/api/conversations');
        const convs = await response.json();
        renderConversationList(convs);
        
        if (convs.length > 0 && !currentConversationId) {
            loadConversation(convs[0].id);
        } else if (convs.length === 0) {
            await createNewChat();
        }
    }

    // 渲染侧边栏列表
    function renderConversationList(convs) {
        conversationList.innerHTML = '';
        convs.forEach(conv => {
            const li = document.createElement('li');
            li.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
            li.innerHTML = `
                <span class="title" data-id="${conv.id}">${conv.title || '新对话'}</span>
                <button class="delete-btn" data-id="${conv.id}">🗑️</button>
            `;
            li.querySelector('.title').addEventListener('click', () => {
                loadConversation(conv.id);
            });
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
            });
            conversationList.appendChild(li);
        });
    }

    // 加载某个对话的消息
    async function loadConversation(convId) {
        currentConversationId = convId;
        messagesContainer.innerHTML = '';
        messagesContainer.appendChild(typingIndicator);

        const response = await fetch(`/api/conversations/${convId}/messages`);
        const messages = await response.json();
        
        if (messages.length === 0) {
            appendMessage('bot', `${getGreeting()} 我是BNDS ChatBot，关于十一学校的问题都可以问我 😊`, false);
        } else {
            // 历史消息直接显示，不逐字：
            messages.forEach(msg => {
                appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, false);
            });
        }
        // 高亮当前对话
        document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
        const activeItem = document.querySelector(`.conversation-item .title[data-id="${convId}"]`);
        if (activeItem) activeItem.parentElement.classList.add('active');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 创建新对话
    async function createNewChat() {
        const response = await fetch('/api/conversations', { method: 'POST' });
        const data = await response.json();
        currentConversationId = data.id;
        messagesContainer.innerHTML = '';
        messagesContainer.appendChild(typingIndicator);
        appendMessage('bot', `${getGreeting()} 我是BNDS ChatBot，关于十一学校的问题都可以问我 😊`, false);
        await loadConversations();
    }

    // 删除对话
    async function deleteConversation(convId) {
        if (!confirm('确定要删除这个对话吗？')) return;
        await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
        if (convId === currentConversationId) {
            currentConversationId = null;
            messagesContainer.innerHTML = '';
            messagesContainer.appendChild(typingIndicator);
        }
        await loadConversations();
    }

    // 发送消息
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message || !currentConversationId) return;

        appendMessage('user', message);
        userInput.value = '';
        userInput.focus();

        await fetch(`/api/conversations/${currentConversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content: message })
        });

        typingIndicator.classList.add('active');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const response = await fetch('/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    conversation_id: currentConversationId 
                })
            });
            const data = await response.json();
            typingIndicator.classList.remove('active');
            appendMessage('bot', data.reply, true);     // ✅ 启用逐字
        } catch (error) {
            typingIndicator.classList.remove('active');
            appendMessage('bot', '⚠️ 连接服务器失败，请稍后重试。');
            console.error('Error:', error);
        }
        await loadConversations();
    }

    // ---------- 事件绑定 ----------
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
    newChatBtn.addEventListener('click', createNewChat);

    // ---------- 启动 ----------
    loadConversations();
});