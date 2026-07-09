import sqlite3
import uuid
from datetime import datetime

import os
DB_PATH = os.path.join("/app/data", "bnds_gpt.db")

def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 让查询结果可以通过列名访问
    return conn

def init_db():
    """初始化数据库：创建两张表"""
    import os
    os.makedirs("/app/data", exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()

    # 对话会话表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT
        )
    ''')

    # 消息表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT,
            FOREIGN KEY (conversation_id) REFERENCES conversations (id)
        )
    ''')

    conn.commit()
    conn.close()
    print("✅ 数据库初始化成功！")

def create_conversation(title="新对话"):
    """创建一个新的对话，返回对话ID"""
    conn = get_db()
    cursor = conn.cursor()
    conv_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)",
        (conv_id, title, now)
    )
    conn.commit()
    conn.close()
    return conv_id

def get_all_conversations():
    """获取所有对话列表（用于侧边栏）"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, title, created_at FROM conversations ORDER BY created_at DESC"
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_messages(conversation_id):
    """获取某个对话的所有消息"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_message(conversation_id, role, content):
    """向对话中添加一条消息"""
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (conversation_id, role, content, now)
    )
    # 如果是第一条用户消息，更新对话标题
    cursor.execute("SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?", (conversation_id,))
    count = cursor.fetchone()["cnt"]
    if count == 1 and role == "user":
        # 用用户消息的前20个字符作为标题
        title = content[:20] + ("..." if len(content) > 20 else "")
        cursor.execute("UPDATE conversations SET title = ? WHERE id = ?", (title, conversation_id))
    conn.commit()
    conn.close()

def delete_conversation(conversation_id):
    """删除一个对话及其所有消息"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()