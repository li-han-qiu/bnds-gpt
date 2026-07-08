from flask import Flask, request, jsonify, render_template
from zhipuai import ZhipuAI
import os
import chromadb
from chromadb.api.types import Documents, Embeddings, EmbeddingFunction
import requests  # 新增，用于调用智谱嵌入API
from langchain.text_splitter import RecursiveCharacterTextSplitter

app = Flask(__name__)

# --- 自定义智谱嵌入函数 (替代旧版内置函数) ---
class ZhipuAIEmbeddingFunction(EmbeddingFunction):
    def __init__(self, api_key: str, model_name: str = "embedding-2"):
        self.api_key = api_key
        self.model_name = model_name
        self.url = "https://open.bigmodel.cn/api/paas/v4/embeddings"
    
    def __call__(self, input: Documents) -> Embeddings:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": self.model_name,
            "input": input
        }
        response = requests.post(self.url, headers=headers, json=data)
        response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]

# --- 初始化智谱客户端 (用于对话生成) ---
zhipu_client = ZhipuAI(api_key=os.getenv("ZHIPU_API_KEY"))

# --- 初始化向量数据库 (使用自定义嵌入函数) ---
zhipu_ef = ZhipuAIEmbeddingFunction(
    api_key=os.getenv("ZHIPU_API_KEY"),
    model_name="embedding-2"
)

chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(
    name="bnds_knowledge",
    embedding_function=zhipu_ef
)

# --- 读取并分割知识库 ---
def load_knowledge_base(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
        return text
    except FileNotFoundError:
        return ""

school_info_text = load_knowledge_base('bnds_official.txt')

# --- 使用 RecursiveCharacterTextSplitter 进行智能分割 ---
def split_text_with_langchain(text):
    # 初始化分割器，设置合适的参数
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,          # 每个块的最大字符数（约 500 个汉字）
        chunk_overlap=50,        # 块与块之间的重叠字符数，保持上下文连贯
        separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],  # 分割优先级
        length_function=len,
        keep_separator=False
    )
    chunks = text_splitter.split_text(text)
    return chunks

# 如果集合为空，且读取到了文本信息，则进行分割和索引
if collection.count() == 0 and school_info_text:
    print("📚 正在初始化知识库，使用 LangChain 智能分割文档...")
    
    # 使用 LangChain 分割
    chunks = split_text_with_langchain(school_info_text)
    
    # 打印分割统计信息
    print(f"✅ 原始文档长度: {len(school_info_text)} 字符")
    print(f"✅ 分割后文档块数量: {len(chunks)} 个")
    print(f"✅ 平均每块长度: {sum(len(c) for c in chunks) // len(chunks)} 字符")
    print("\n📄 前 3 个文档块预览：")
    for i, chunk in enumerate(chunks[:3]):
        print(f"\n--- 块 {i+1} (长度: {len(chunk)} 字符) ---")
        print(chunk[:100] + "..." if len(chunk) > 100 else chunk)
    
    # 存入向量数据库
    ids = [f"doc_{i}" for i in range(len(chunks))]
    collection.add(
        documents=chunks,
        ids=ids
    )
    print(f"\n✅ 成功将 {len(chunks)} 个文档块存入向量库。")
else:
    print(f"📊 知识库已存在，共有 {collection.count()} 个文档块。")

# --- Flask 路由 ---
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/ask', methods=['POST'])
def ask():
    user_input = request.json.get('message', '')
    if not user_input:
        return jsonify({'reply': '请说点什么吧'})

    try:
        # 检索最相关的文档块
        results = collection.query(
            query_texts=[user_input],
            n_results=3
        )
        
        if results['documents'] and results['documents'][0]:
            retrieved_chunks = results['documents'][0]
            context = "\n\n".join(retrieved_chunks)
        else:
            context = "（知识库中暂无相关信息）"

        system_prompt = f"""你是一个专门回答北京市十一学校相关问题的AI助手。
请严格基于以下参考资料来回答用户的问题。如果参考资料中没有相关信息，请明确告知用户"根据目前的知识库，我无法回答这个问题"。

=== 参考资料 ===
{context}
=== 参考资料结束 ===
"""
        response = zhipu_client.chat.completions.create(
            model="glm-4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input}
            ],
        )
        reply = response.choices[0].message.content
        return jsonify({'reply': reply})

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'reply': f'处理请求时出错: {str(e)}'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)