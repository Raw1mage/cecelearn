// ------------------------ 核心數據與狀態 ------------------------
const RAW_DEFAULT_IDIOMS = [
    "五光十色", "情不自禁", "一望無際", "奇形怪狀", "半信半疑", "守望相助", "冒險犯難", "千奇百怪",
    "勞民傷財", "欣欣向榮", "山明水秀", "春暖花開", "丟三落四", "察言觀色", "一言為定", "天南地北",
    "力不從心", "如魚得水", "天真無邪", "成群結隊", "各有千秋", "一知半解", "多才多藝", "應接不暇",
    "不甘示弱", "出神入化", "別開生面", "後來居上", "喜出望外", "一鼓作氣", "川流不息", "口是心非",
    "打抱不平", "一五一十", "回頭是岸", "亡羊補牢", "春風化雨", "感同身受", "守口如瓶", "揚揚得意",
    "世外桃源", "四面八方", "天寒地凍", "呼風喚雨", "平易近人", "不遠千里", "一目了然", "勢如破竹",
    "前功盡棄", "傷風敗俗", "人定勝天", "井底之蛙", "不務正業", "不可捉摸", "三言兩語", "一模一樣",
    "層出不窮", "婆婆媽媽", "妙手回春", "大驚小怪", "大失所望", "賽翁失馬", "坐立不安", "喜新厭舊",
    "吞吞吐吐", "名落孫山", "左右為難", "得不償失", "悔不當初", "悲歡離合", "愁眉不展", "投機取巧",
    "挺而走險", "接二連三", "揚長而去", "損人利己", "暴跳如雷", "本末倒置", "東窗事發", "橫衝直撞",
    "隨心所欲", "七上八下", "此起彼落", "垂頭喪氣", "不由自主", "不可思議", "拿手好戲", "大庭廣眾",
    "一帆風順", "千山萬水", "手足無措", "技藝超群", "志氣昂揚", "亂作一團", "心驚膽顫", "固若金湯",
    "井然有序", "人山人海", "皆大歡喜", "出人意料", "同心協力", "自告奮勇", "百折不撓", "百思不解"
];

let quizData = []; // 儲存 LLM 生成的測驗題目
let userAnswers = []; // 儲存使用者答案狀態
let currentQuestionIndex = 0;
let isSubmitted = false;
let isReviewMode = false;
const apiKey = ""; // 留空，Canvas 環境會自動注入
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

// DOM 元素
const setupScreen = document.getElementById('setup-screen');
const quizArea = document.getElementById('quiz-area');
const resultScreen = document.getElementById('result-screen');
const generateBtn = document.getElementById('generate-btn');
const loadingIndicator = document.getElementById('loading-indicator');

const questionTextElement = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const progressElement = document.getElementById('progress');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const submitBtn = document.getElementById('submit-btn');
const idiomsListTextarea = document.getElementById('idioms-list');
const questionCountInput = document.getElementById('question-count');
const defaultIdiomsListEditable = document.getElementById('default-idioms-list-editable');

// ------------------------ 框架控制邏輯 ------------------------

window.onload = function() {
    // 初始載入時顯示預設成語庫內容，並填入新的可編輯 textarea
    defaultIdiomsListEditable.value = RAW_DEFAULT_IDIOMS.join(', ');
    questionCountInput.value = 5; // 確保初始值為 5
    showSetupScreen();
}

function showSetupScreen() {
    quizArea.style.display = 'none';
    resultScreen.style.display = 'none';
    setupScreen.style.display = 'block';
}

/**
 * 處理「再試一次」的邏輯：重置作答狀態，並開始測驗
 */
function handleTryAgain() {
    if (quizData.length === 0) {
         alert('錯誤：沒有題目數據可供重試，請先設定詞庫並點擊「出題」！');
         showSetupScreen();
         return;
    }

    // 1. 重置所有作答和流程狀態
    currentQuestionIndex = 0;
    isSubmitted = false;
    isReviewMode = false;

    // 2. 重新初始化 userAnswers 陣列 (重設答案)
    userAnswers = quizData.map(() => ({
        selected: null,
        isCorrect: null,
    }));

    // 3. 畫面切換與載入第一題
    setupScreen.style.display = 'none';
    resultScreen.style.display = 'none';
    quizArea.style.display = 'block';

    loadQuestion();
}


// ------------------------ 題目管理與 LLM 邏輯 ------------------------

/**
 * 彈性解析成語列表
 */
function parseIdioms(text) {
    // 使用正則表達式分割：空白、逗號(中英)、分號(中英)、換行
    return text.split(/[\s,;，；\n]+/)
               .map(idiom => idiom.trim())
               .filter(idiom => idiom.length > 0);
}

/**
 * 隨機選取成語 (Fisher-Yates shuffle)
 */
function selectRandomIdioms(allIdioms, count) {
    if (allIdioms.length <= count) {
        return allIdioms.slice(); // 如果總數不夠或剛好，則返回複製後的全部
    }
    let shuffled = allIdioms.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count); // 取前 n 個
}

/**
 * 處理「隨機選詞」按鈕邏輯
 */
function selectRandomIdiomsToQuizList() {
    // 獲取當前可編輯的預設詞庫
    const currentDefaultIdioms = parseIdioms(defaultIdiomsListEditable.value);

    let count = parseInt(questionCountInput.value);
    if (isNaN(count) || count < 1) {
        count = 5; // 預設為 5
        questionCountInput.value = 5;
    }

    if (currentDefaultIdioms.length === 0) {
        alert('錯誤：預設成語庫為空，無法隨機選詞！');
        return;
    }

    const selected = selectRandomIdioms(currentDefaultIdioms, count);
    idiomsListTextarea.value = selected.join(', '); // 用逗號分隔顯示
}


/**
 * 帶有指數退避的 Fetch 函式
 */
async function fetchWithBackoff(url, options, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            if (response.status === 429 || response.status >= 500) {
                // 針對頻率限制或伺服器錯誤進行重試
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            // 非 HTTP 錯誤（如網路錯誤）也進行退避重試
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}


/**
 * 呼叫 LLM 產生題目
 */
async function regenerateQuiz() {
    const idiomsText = idiomsListTextarea.value;
    let allIdioms = parseIdioms(idiomsText);
    let questionCount = parseInt(questionCountInput.value);

    // 確保數量不為空且大於 0
    if (isNaN(questionCount) || questionCount < 1) {
         questionCount = 5;
         questionCountInput.value = 5;
    }

    // 1. 驗證輸入
    if (allIdioms.length === 0) {
        alert('錯誤：請先在「出題詞庫」中輸入成語，或點擊「隨機選詞」。');
        return;
    }
    if (allIdioms.length < 4) {
        alert('錯誤：請提供至少 4 個成語，才能確保每個選項都有干擾詞！');
        return;
    }

    generateBtn.disabled = true;
    loadingIndicator.style.display = 'block';

    // 2. 隨機選取用於出題的成語
    const idiomsForQuiz = allIdioms;

    // 3. 準備 LLM 請求
    const systemPrompt = `你是一位中文語言專家和測驗設計師。你的任務是根據提供的成語列表，生成指定數量的選擇題。
        要求：
        1. 每道題必須是一個短句或情境，其中一個成語被替換為填空符號 '________'。
        2. 每個選項都必須是提供的成語列表中的詞彙。
        3. 正確答案必須是唯一符合情境的詞彙。
        4. 產生的結果必須是結構化的 JSON 陣列，嚴格遵守提供的 JSON Schema。
        `;

    const userQuery = `
        請從以下成語列表中生成 ${questionCount} 道選擇題：
        成語列表：${idiomsForQuiz.join(', ')}
        請確保這 ${questionCount} 道題目都使用到列表中不同的成語作為正確答案。
        `;

    const responseSchema = {
        type: "ARRAY",
        description: "一個包含所有生成題目的 JSON 陣列。",
        items: {
            type: "OBJECT",
            properties: {
                question: { type: "STRING", description: "帶有填空符號 '________' 的問題敘述。" },
                options: {
                    type: "ARRAY",
                    items: { type: "STRING" },
                    description: "四個選項，包括正確答案和三個干擾選項。"
                },
                correctAnswer: { type: "NUMBER", description: "正確答案的選項索引 (0=A, 1=B, 2=C, 3=D)。" }
            },
            required: ["question", "options", "correctAnswer"],
            propertyOrdering: ["question", "options", "correctAnswer"]
        }
    };

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };

    try {
        const response = await fetchWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            throw new Error("AI 產生內容為空或結構不符。");
        }

        const newQuizData = JSON.parse(jsonText);

        if (newQuizData.length === 0) {
            throw new Error("AI 未生成任何題目。");
        }

        quizData = newQuizData; // 更新全局題目數據
        // 初始化 userAnswers 並顯示測驗畫面
        currentQuestionIndex = 0;
        isSubmitted = false;
        isReviewMode = false;
        userAnswers = quizData.map(() => ({ selected: null, isCorrect: null }));

        setupScreen.style.display = 'none';
        quizArea.style.display = 'block';
        loadQuestion();

    } catch (error) {
        console.error('LLM 生成題目錯誤:', error);
        alert(`題目生成失敗。請檢查您的成語列表和網路連線。錯誤資訊：${error.message}`);
    } finally {
        generateBtn.disabled = false;
        loadingIndicator.style.display = 'none';
    }
}

// ------------------------ 測驗 UI 與導航邏輯 ------------------------

/**
 * 根據當前索引載入問題內容
 */
function loadQuestion() {
    if (quizData.length === 0) {
        showSetupScreen(); // 如果沒有題目，返回設定頁
        return;
    }

    const currentQuiz = quizData[currentQuestionIndex];
    const currentAnswerState = userAnswers[currentQuestionIndex];

    // 1. 更新題目顯示 (填空)
    const filledWord = currentAnswerState.selected !== null ?
        `<span class="filled-word">${currentQuiz.options[currentAnswerState.selected]}</span>` :
        '________';
    questionTextElement.innerHTML = `Q${currentQuestionIndex + 1}: ${currentQuiz.question.replace('________', filledWord)}`;

    // 2. 更新進度條
    progressElement.textContent = `第 ${currentQuestionIndex + 1} 題，共 ${quizData.length} 題`;

    // 3. 渲染選項按鈕
    optionsContainer.innerHTML = '';
    const correctIndex = currentQuiz.correctAnswer;

    currentQuiz.options.forEach((option, index) => {
        const button = document.createElement('button');
        const optionLabel = String.fromCharCode(65 + index);
        button.textContent = `${optionLabel}. ${option}`;
        button.classList.add('option-btn');
        button.dataset.index = index;

        if (isSubmitted) {
            // 交卷後：顯示對錯，禁用點擊
            button.classList.add('disabled');
            if (index === correctIndex) {
                button.classList.add('correct-answer');
            }
            if (index === currentAnswerState.selected && currentAnswerState.isCorrect === false) {
                button.classList.add('wrong-selected');
            }
        } else {
            // 未交卷：允許點擊，標記選中
            button.onclick = () => handleAnswer(button, index);
            if (index === currentAnswerState.selected) {
                button.classList.add('selected');
            }
        }
        optionsContainer.appendChild(button);
    });

    // 4. 控制導航按鈕顯示
    updateNavButtons();
}

/**
 * 處理用戶點擊答案（僅記錄選擇，不判斷對錯）
 */
function handleAnswer(selectedButton, selectedIndex) {
    // 1. 記錄選擇
    userAnswers[currentQuestionIndex].selected = selectedIndex;

    // 2. 視覺更新：標記選中，移除其他選項的標記
    optionsContainer.querySelectorAll('.option-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    selectedButton.classList.add('selected');

    // 3. 填空視覺更新 (即時填入)
    const currentQuiz = quizData[currentQuestionIndex];
    const filledWord = `<span class="filled-word">${currentQuiz.options[selectedIndex]}</span>`;
    questionTextElement.innerHTML = `Q${currentQuestionIndex + 1}: ${currentQuiz.question.replace('________', filledWord)}`;

    // 4. 更新導航按鈕（確保交卷按鈕在最後一題顯示）
    updateNavButtons();
}

/**
 * 更新導航按鈕的顯示狀態
 */
function updateNavButtons() {
    const setupBtn = document.getElementById('setup-btn');

    // 1. 上一題按鈕 (從第 2 題開始顯示)
    prevBtn.style.display = currentQuestionIndex > 0 && !isReviewMode ? 'block' : 'none';
    setupBtn.style.display = 'block';

    // 2. 只有在未交卷且非回顧模式下才顯示 Next/Submit
    if (!isSubmitted && !isReviewMode) {
        if (currentQuestionIndex < quizData.length - 1) {
            nextBtn.style.display = 'block';
            submitBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'none';
            // 只有在最後一題且有選答案時才顯示交卷按鈕
            submitBtn.style.display = userAnswers[currentQuestionIndex].selected !== null ? 'block' : 'none';
        }
    } else {
         // 交卷後，隱藏 Next/Submit 按鈕
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
    }
}

/**
 * 跳轉至下一題
 */
function goNext() {
    if (currentQuestionIndex < quizData.length - 1) {
        currentQuestionIndex++;
        loadQuestion();
    }
}

/**
 * 回到上一題
 */
function goPrev() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        loadQuestion();
    }
}

/**
 * 提交並顯示成績（在此處進行批改）
 */
function handleSubmit() {
    isSubmitted = true;
    let correctCount = 0;

    // 檢查所有題目是否都已作答
    const unanswered = userAnswers.filter(a => a.selected === null).length;
    if (unanswered > 0) {
        // 如果有未作答的題目，跳轉到第一道未作答的題目
        currentQuestionIndex = userAnswers.findIndex(a => a.selected === null);
        alert(`請先完成所有 ${quizData.length} 題，您還有 ${unanswered} 題未作答！`);
        isSubmitted = false; // 取消提交狀態
        loadQuestion();
        return;
    }

    // 進行批改並記錄對錯
    userAnswers.forEach((state, index) => {
        const isCorrect = (state.selected === quizData[index].correctAnswer);
        state.isCorrect = isCorrect;
        if (isCorrect) {
            correctCount++;
        }
    });

    let totalQuestions = quizData.length;
    let percentage = (correctCount / totalQuestions) * 100;
    let message = '';
    let emoji = '';
    const wrongCount = totalQuestions - correctCount;

    if (percentage === 100) {
        message = '你真是成語大師！全部答對了！🎉';
        emoji = '⭐';
    } else if (percentage >= 75) {
        message = '表現非常出色！你的成語知識很豐富。👍';
        emoji = '🥳';
    } else {
        message = '別灰心，這些成語很有挑戰性，透過回顧錯題，一定能更進步！💪';
        emoji = '💡';
    }

    quizArea.style.display = 'none';
    resultScreen.style.display = 'block';

    resultScreen.innerHTML = `
        <h2>測驗結束 ${emoji}</h2>
        <p>你的總分是：<strong style="color: #d84315;">${correctCount} / ${totalQuestions}</strong> 題</p>
        <p style="font-size: 1.2rem; color: #004d40;">${message}</p>
        <button class="action-btn" onclick="showSetupScreen()">返回設定</button>
        <button class="action-btn" onclick="handleTryAgain()">再試一次</button>
        ${wrongCount > 0 ? `<button class="action-btn" onclick="showReview()">錯題回顧 (${wrongCount} 題)</button>` : ''}
    `;
}

/**
 * 顯示錯題回顧
 */
function showReview() {
    isReviewMode = true;
    resultScreen.style.display = 'block';
    quizArea.style.display = 'none';

    // 篩選出錯誤答案
    const wrongAnswers = userAnswers.map((state, index) => ({
        ...state,
        ...quizData[index],
        index: index
    })).filter(item => item.isCorrect === false);

    if (wrongAnswers.length === 0) {
        resultScreen.innerHTML = `
            <h2>太棒了！</h2>
            <p style="font-size: 1.2rem; color: #004d40;">你沒有任何錯誤的題目！🎉</p>
            <button class="action-btn" onclick="showSetupScreen()">返回設定</button>
        `;
        return;
    }

    const reviewListHTML = wrongAnswers.map(item => {
        // 替換挖空處
        const userAnswerText = item.selected !== null ? item.options[item.selected] : '(未作答)';
        const filledQuestion = item.question.replace('________', `<span class="filled-word">${userAnswerText}</span>`);
        const correctOption = item.options[item.correctAnswer];

        return `
            <div class="review-item">
                <p><strong>Q${item.index + 1}:</strong> ${filledQuestion}</p>
                <p>你的答案：<span style="color: #c62828;">${userAnswerText}</span> (錯)</p>
                <p>正確答案：<span style="color: #388e3c;">${correctOption}</span></p>
            </div>
        `;
    }).join('');


    resultScreen.innerHTML = `
        <h2>錯題回顧 🧐</h2>
        <div class="review-list">${reviewListHTML}</div>
        <button class="action-btn" onclick="showSetupScreen()" style="margin-top: 20px;">返回設定</button>
        <button class="action-btn" onclick="handleTryAgain()" style="margin-top: 20px;">再試一次</button>
    `;
}
