const wordInput = document.getElementById('wordInput');
const resultDiv = document.getElementById('result');
const statusText = document.getElementById('status');
const micButton = document.getElementById('micButton');
const lookupButton = document.getElementById('lookupButton');
let recognition = null;

function setStatus(message = '') {
    if (statusText) {
        statusText.textContent = message;
    }
}

function renderDefinitions(data) {
    resultDiv.innerHTML = '';

    if (!data?.heteronyms || !Array.isArray(data.heteronyms)) {
        resultDiv.innerHTML = '<p>查無此詞。</p>';
        return;
    }

    data.heteronyms.forEach((item) => {
        const pinyin = item.pinyin || '－';
        const definitions = item.definitions
            ?.map((def) => def.def)
            .filter(Boolean)
            .join('<br>') || '沒有提供解釋。';

        resultDiv.innerHTML += `<p><b>拼音:</b> ${pinyin}</p><p><b>解釋:</b><br>${definitions}</p><hr>`;
    });
}

function lookup() {
    const word = wordInput?.value.trim();
    resultDiv.innerHTML = '';

    if (!word) {
        setStatus('請輸入要查詢的詞。');
        return;
    }

    setStatus('查詢中...');

    fetch(`https://www.moedict.tw/uni/${encodeURIComponent(word)}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then((data) => {
            renderDefinitions(data);
            setStatus('查詢完成。');
        })
        .catch((error) => {
            console.error('Error:', error);
            resultDiv.innerHTML = '<p>查詢時發生錯誤，請稍後再試。</p>';
            setStatus('無法取得資料。');
        });
}

function attachLookupEvents() {
    if (lookupButton) {
        lookupButton.addEventListener('click', lookup);
    }

    if (wordInput) {
        wordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                lookup();
            }
        });
    }
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition || !micButton) {
        if (micButton) {
            micButton.disabled = true;
        }
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        setStatus('正在聆聽...');
        micButton.disabled = true;
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (wordInput) {
            wordInput.value = transcript;
        }
        lookup();
    };

    recognition.onerror = () => {
        setStatus('語音辨識失敗，請再試一次。');
        micButton.disabled = false;
    };

    recognition.onend = () => {
        micButton.disabled = false;
        if (!statusText?.textContent) {
            setStatus('');
        }
    };

    micButton.addEventListener('click', () => {
        try {
            recognition.start();
        } catch (error) {
            // If recognition is already started, ignore.
        }
    });
}

attachLookupEvents();
initSpeechRecognition();
