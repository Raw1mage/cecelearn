# Integration Guide - Using Local AI with A1/A2/A3 Projects

This guide shows how to integrate the local LLM API with your existing projects.

## A2_Chinese_idiom_practice Integration

### Current Setup (Using Google Gemini)
The A2 project currently uses Google's Gemini API which requires an API key and internet connection.

### Migration to Local AI

**Step 1: Ensure Local AI is Running**

```bash
cd A4_local_ai
bash scripts/run_server.sh
```

Verify it's running:
```bash
curl http://localhost:8000/health
```

**Step 2: Update A2 JavaScript**

Edit `A2_Chinese_idiom_practice/js/app.js`:

Find these lines (around line 310):
```javascript
const apiKey = ""; // 留空，Canvas 環境會自動注入
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
```

Replace with:
```javascript
const apiKey = ""; // Not needed for local API
const apiUrl = `http://localhost:8000/v1beta/models/gemini:generateContent`;
```

**That's it!** No other changes needed. The local API is Gemini-compatible.

### Benefits

- ✅ No API key required
- ✅ No internet required (after model download)
- ✅ Faster responses (local GPU)
- ✅ Free unlimited usage
- ✅ Complete privacy (data stays local)

### Testing

1. Open `A2_Chinese_idiom_practice/index.html` in browser
2. Click "隨機選詞" to select random idioms
3. Click "出題" to generate questions
4. Questions should appear immediately (no "AI 正在努力出題中" delay)

## A1_Chinese_word_lookup Integration

### Option 1: Enhanced Explanations

Add AI-powered explanations to word lookups.

**Add to `A1_Chinese_word_lookup/js/app.js`:**

```javascript
async function getAIExplanation(word, definition) {
    const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: "你是一位中文教師，請用簡單易懂的方式解釋詞彙。"
                },
                {
                    role: "user",
                    content: `請為「${word}」提供例句和詳細解釋。字典定義：${definition}`
                }
            ],
            max_tokens: 200,
            temperature: 0.7
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}
```

### Option 2: Example Sentence Generation

```javascript
async function generateExamples(word) {
    const response = await fetch('http://localhost:8000/v1/completions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            prompt: `生成3個使用「${word}」的句子：\n1.`,
            max_tokens: 150,
            temperature: 0.8
        })
    });

    const data = await response.json();
    return data.choices[0].text;
}
```

## A3_Math_4ops_learn Integration

### Custom Problem Generation

Add AI-generated word problems to math exercises.

**Add to `A3_Math_4ops_learn/js/app.js`:**

```javascript
async function generateMathWordProblem(operation, num1, num2) {
    const opNames = {'+': '加法', '-': '減法', '×': '乘法', '÷': '除法'};

    const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: "你是一位數學老師，請創建適合小學生的數學應用題。"
                },
                {
                    role: "user",
                    content: `創建一個${opNames[operation]}應用題，使用數字 ${num1} 和 ${num2}。例如：「小明有${num1}個蘋果...」`
                }
            ],
            max_tokens: 100,
            temperature: 0.8
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}
```

## General Integration Patterns

### Pattern 1: OpenAI Chat Completion

```javascript
async function askAI(prompt) {
    const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            messages: [
                {role: "user", content: prompt}
            ],
            temperature: 0.7,
            max_tokens: 500
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}
```

### Pattern 2: Gemini-Compatible

```javascript
async function askAIGemini(prompt, systemInstruction = "") {
    const payload = {
        contents: [
            {parts: [{text: prompt}]}
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
        }
    };

    if (systemInstruction) {
        payload.systemInstruction = {
            parts: [{text: systemInstruction}]
        };
    }

    const response = await fetch(
        'http://localhost:8000/v1beta/models/gemini:generateContent',
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        }
    );

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
```

### Pattern 3: Simple Text Completion

```javascript
async function completeText(prompt) {
    const response = await fetch('http://localhost:8000/v1/completions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            prompt: prompt,
            max_tokens: 150,
            temperature: 0.7
        })
    });

    const data = await response.json();
    return data.choices[0].text;
}
```

## Error Handling

Always add error handling for API calls:

```javascript
async function safeAICall(prompt) {
    try {
        const response = await fetch('http://localhost:8000/v1/chat/completions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                messages: [{role: "user", content: prompt}]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;

    } catch (error) {
        console.error('AI API Error:', error);

        // Fallback behavior
        return "抱歉，AI 暫時無法回應。請確認 Local AI 服務正在運行。";
    }
}
```

## CORS Configuration

The local API is pre-configured to allow requests from:
- `http://localhost:3000`
- `http://localhost:8080`
- `http://127.0.0.1:5500`
- `http://localhost:5500`

If you're using a different port, update `.env`:

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:YOUR_PORT
```

Then restart the server.

## Performance Tips

### 1. Adjust Temperature
- Creative tasks (story generation): `0.8 - 1.0`
- Factual tasks (definitions): `0.3 - 0.5`
- Question generation: `0.7 - 0.8`

### 2. Control Output Length
```javascript
max_tokens: 100  // Short responses
max_tokens: 500  // Medium responses
max_tokens: 2000 // Long responses
```

### 3. Use Streaming for Long Responses
```javascript
// For real-time display of generation
const response = await fetch('http://localhost:8000/v1/chat/completions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        messages: [{role: "user", content: prompt}],
        stream: true  // Enable streaming
    })
});
```

## Testing Integration

After integrating, verify everything works:

1. **Check API is running:**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Test from browser console:**
   ```javascript
   fetch('http://localhost:8000/v1/chat/completions', {
       method: 'POST',
       headers: {'Content-Type': 'application/json'},
       body: JSON.stringify({
           messages: [{role: "user", content: "Hello"}]
       })
   }).then(r => r.json()).then(console.log)
   ```

3. **Monitor server logs:**
   Watch the terminal where API is running for any errors

## Troubleshooting

### CORS Errors
```
Access to fetch at 'http://localhost:8000' from origin 'http://localhost:5500'
has been blocked by CORS policy
```

**Solution:** Add your origin to `.env` ALLOWED_ORIGINS

### Connection Refused
```
Failed to fetch
```

**Solution:** Ensure API server is running (`bash scripts/run_server.sh`)

### Slow Responses
**Solution:** Check GPU layers in `.env`, increase if needed

## Next Steps

1. Update A2_Chinese_idiom_practice first (easiest, drop-in replacement)
2. Add AI enhancements to A1_Chinese_word_lookup
3. Integrate word problems in A3_Math_4ops_learn
4. Monitor GPU usage and adjust settings as needed

Happy coding!
