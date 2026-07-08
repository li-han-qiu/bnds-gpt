function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，注意休息哦 🌙';
    if (hour < 12) return '早上好！今天有什么想了解的？☀️';
    if (hour < 18) return '下午好！有什么能帮你的？📚';
    return '晚上好！学习一天辛苦了 🌟';
}
// 修改初始问候
document.querySelector('.message.bot .bubble').textContent = 
    `你好！${getGreeting()} 我是BNDS GPT，关于十一学校的问题都可以问我 😊`;

document.addEventListener('DOMContentLoaded', function() {
    const messagesContainer = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');

    // 发送消息的核心函数
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        // 1. 显示用户消息
        appendMessage('user', message);
        userInput.value = '';
        userInput.focus();

        // 2. 显示"正在思考"
        typingIndicator.classList.add('active');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            // 3. 发送到后端
            const response = await fetch('/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
            const data = await response.json();

            // 4. 隐藏"正在思考"
            typingIndicator.classList.remove('active');

            // 5. 显示AI回复
            appendMessage('bot', data.reply);
        } catch (error) {
            typingIndicator.classList.remove('active');
            appendMessage('bot', '⚠️ 连接服务器失败，请稍后重试。');
            console.error('Error:', error);
        }
    }

    // 添加消息到界面
    function appendMessage(type, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = type === 'user' ? '👤' : '🤖';
        messageDiv.appendChild(avatar);
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        messageDiv.appendChild(bubble);
        
        messagesContainer.insertBefore(messageDiv, typingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // 如果是AI消息，逐字输出
        if (type === 'bot') {
            let index = 0;
            bubble.textContent = '';
            const interval = setInterval(() => {
                if (index < text.length) {
                    bubble.textContent += text[index];
                    index++;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else {
                    clearInterval(interval);
                }
            }, 15); // 15ms一个字，快慢适中
        } else {
            bubble.textContent = text;
        }
    }

    // 绑定事件
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
});