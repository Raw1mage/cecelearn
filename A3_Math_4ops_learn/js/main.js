// --- DOM Elements ---
const numA_input = document.getElementById('numA');
const numB_input = document.getElementById('numB');
const keypadContainer = document.getElementById('keypad-container');
const stepsDiv = document.getElementById('calculation-steps');
const answerBox = document.getElementById('final-answer-box');
const speedControl = document.getElementById('speed-control');
const pausePlayBtn = document.getElementById('pause-play-btn');
const cancelBtn = document.getElementById('cancel-btn');
const pauseIcon = document.getElementById('pause-icon');
const playIcon = document.getElementById('play-icon');

// --- State Variables ---
let selectedOperator = null;
let activeInput = null;
let animationSpeed = parseInt(speedControl.value, 10);
let isPaused = false;
let isCancelled = false;
let pausePromiseResolver = null;

// --- Event Listeners ---
speedControl.addEventListener('change', (e) => {
    animationSpeed = parseInt(e.target.value, 10);
});

// --- Core Functions ---
function showKeypad(inputElement) {
    keypadContainer.classList.add('visible');
    if (activeInput) {
        activeInput.classList.remove('input-active');
    }
    activeInput = inputElement;
    activeInput.classList.add('input-active');
}

function hideKeypad() {
    keypadContainer.classList.remove('visible');
    if (activeInput) {
        activeInput.classList.remove('input-active');
        activeInput.blur();
    }
    activeInput = null;
}

function keypadInput(digit) {
    if (!activeInput) return;
    if (document.activeElement === activeInput) {
        const start = activeInput.selectionStart;
        const end = activeInput.selectionEnd;
        const text = activeInput.value;
        activeInput.value = text.slice(0, start) + digit + text.slice(end);
        activeInput.selectionStart = activeInput.selectionEnd = start + 1;
    } else {
         if (activeInput.value === '0') {
            activeInput.value = digit;
        } else {
            activeInput.value += digit;
        }
    }
}

function keypadClear() {
    if (activeInput) activeInput.value = '';
}

function keypadBackspace() {
    if (activeInput) {
         if (document.activeElement === activeInput) {
            const start = activeInput.selectionStart;
            const end = activeInput.selectionEnd;
            if (start === end && start > 0) {
                activeInput.value = activeInput.value.slice(0, start - 1) + activeInput.value.slice(end);
                activeInput.selectionStart = activeInput.selectionEnd = start - 1;
            } else {
                activeInput.value = activeInput.value.slice(0, start) + activeInput.value.slice(end);
                activeInput.selectionStart = activeInput.selectionEnd = start;
            }
        } else {
            activeInput.value = activeInput.value.slice(0, -1);
        }
    }
}

function selectOperator(operator) {
    selectedOperator = operator;
    const operatorDisplay = document.getElementById('operator-display');
    operatorDisplay.textContent = {'+': '+', '-': '−', '*': '×', '/': '÷'}[operator];
    operatorDisplay.classList.remove('text-gray-400');
    if (activeInput === numA_input) showKeypad(numB_input);
}

async function calculate() {
    hideKeypad();
    isCancelled = false;
    const numA_val = numA_input.value, numB_val = numB_input.value;

    if (numA_val === '' || numB_val === '') { stepsDiv.textContent = '請輸入兩個數字哦！'; return; }
    if (!selectedOperator) { stepsDiv.textContent = '請先選擇一個運算子喔！'; return; }
    let numA = parseInt(numA_val), numB = parseInt(numB_val);
    if (isNaN(numA) || isNaN(numB)) { stepsDiv.textContent = '這不是數字耶，請重新輸入。'; return; }

    setControlsState(true);

    stepsDiv.innerHTML = '';
    stepsDiv.className = 'calculation-display';
    answerBox.textContent = '-';

    let finalResult;
    switch (selectedOperator) {
        case '+': finalResult = await displayAddition(numA, numB, stepsDiv); break;
        case '-': finalResult = await displaySubtraction(numA, numB, stepsDiv); break;
        case '*': finalResult = await displayMultiplication(numA, numB, stepsDiv); break;
        case '/': finalResult = await displayDivision(numA, numB, stepsDiv); break;
    }

    if (isCancelled) {
        stepsDiv.innerHTML = '<p class="text-gray-500">計算已取消。</p>';
        return;
    }

    if (finalResult !== undefined) {
         answerBox.textContent = finalResult;
    }

    setControlsState(false);
    if(isPaused) togglePause();
}

// --- Animation Control ---
function togglePause() {
    isPaused = !isPaused;
    pauseIcon.classList.toggle('hidden', isPaused);
    playIcon.classList.toggle('hidden', !isPaused);

    if (!isPaused && pausePromiseResolver) {
        pausePromiseResolver();
        pausePromiseResolver = null;
    }
}

function cancelCalculation() {
    isCancelled = true;
    if (isPaused) {
        togglePause();
    }
    setControlsState(false);
    answerBox.textContent = '-';
}

function setControlsState(isCalculating) {
     document.querySelectorAll('#numA, #numB, #equals-btn, #speed-control, .keypad-btn').forEach(el => el.disabled = isCalculating);
     pausePlayBtn.disabled = !isCalculating;
     cancelBtn.disabled = !isCalculating;
}

async function sleep(multiplier = 1) {
    if (isCancelled) return Promise.reject('Cancelled');
    if (isPaused) {
        await new Promise(resolve => {
            pausePromiseResolver = resolve;
        });
    }
    if (isCancelled) return Promise.reject('Cancelled');
    const delay = animationSpeed * multiplier;
    return new Promise(resolve => setTimeout(resolve, delay));
}

// --- VISUALIZATION FUNCTIONS ---
async function displayAddition(a, b, element) {
    try {
        const sum = a + b;
        let aStr = a.toString(), bStr = b.toString();
        let state = { numA: aStr, numB: bStr, operator: '+', result: '', carries: {}, borrows: {}, highlights: [], showLine: true };
        renderCalculationState(element, state); await sleep(0.75);
        let carry = 0;
        for (let i = 0; i < Math.max(aStr.length, bStr.length) || carry > 0; i++) {
            state.highlights = [i]; renderCalculationState(element, state); await sleep();
            const digitSum = parseInt(aStr[aStr.length-1-i]||'0') + parseInt(bStr[bStr.length-1-i]||'0') + carry;
            state.result = (digitSum % 10).toString() + state.result;
            carry = Math.floor(digitSum / 10);
            if (carry > 0) state.carries[i + 1] = carry; else delete state.carries[i + 1];
            state.highlights = []; renderCalculationState(element, state);
        }
        state.result = sum.toString(); renderCalculationState(element, { ...state, carries: {} });
        return sum;
    } catch (e) { if(e !== 'Cancelled') console.error(e); }
}

async function displaySubtraction(a, b, element) {
     try {
        if (a < b) { element.textContent = "被減數不可以比減數小喔！"; return "錯誤"; }
        const diff = a - b;
        let aStr = a.toString(), bStr = b.toString();
        let logicArr = aStr.split('').map(Number);
        let state = { numA: aStr, numB: bStr, operator: '-', result: '', carries: {}, borrows: {}, highlights: [], showLine: true };
        renderCalculationState(element, state); await sleep(0.75);
        for (let i = 0; i < Math.max(aStr.length, bStr.length); i++) {
            state.highlights = [i]; renderCalculationState(element, state); await sleep();
            let digitA_idx = logicArr.length-1-i, digitA = logicArr[digitA_idx];
            let digitB = parseInt(bStr[bStr.length - 1 - i] || '0');
            if (digitA < digitB) {
                let j = digitA_idx - 1;
                while (j >= 0) {
                    const originalVal = logicArr[j]; logicArr[j]--;
                    state.borrows[logicArr.length-1-j] = { original: originalVal, current: logicArr[j] };
                    renderCalculationState(element, state); await sleep(0.75);
                    if (logicArr[j] >= 0) break;
                    logicArr[j] = 9; state.borrows[logicArr.length - 1 - j] = { original: originalVal, current: 9 };
                    j--;
                }
                digitA += 10;
            }
            state.result = (digitA-digitB).toString() + state.result;
            state.highlights = []; renderCalculationState(element, state);
        }
        state.result = diff.toString(); renderCalculationState(element, state);
        return diff;
    } catch (e) { if(e !== 'Cancelled') console.error(e); }
}

function renderMultiplicationState(element, state) {
    element.innerHTML = '';
    element.className = 'calculation-display';
    const { numA, numB, partialProducts, currentPartialProduct, finalSum, highlights, carries } = state;

    const allNumbers = [numA, numB, ...partialProducts.map(p => p.value + ' '.repeat(p.shift)), finalSum];
    if (currentPartialProduct && currentPartialProduct.value) {
        allNumbers.push(currentPartialProduct.value + ' '.repeat(currentPartialProduct.shift));
    }
    const displayLen = allNumbers.reduce((max, str) => Math.max(max, str ? str.length : 0), 0) + 2;

    const createRow = (numStr, options = {}) => {
        const { type, highlightDigits = [], shift = 0 } = options;
        const row = document.createElement('div');
        row.className = 'calc-row';

        const opCell = document.createElement('div');
        opCell.className = 'digit-cell';
        if (type === 'numB') opCell.textContent = '×';
        row.appendChild(opCell);

        const paddedStr = (numStr || '').padStart(displayLen - 1 - shift, ' ') + ' '.repeat(shift);

        for (let i = 0; i < paddedStr.length; i++) {
            const digit = paddedStr[i];
            const cell = document.createElement('div');
            cell.className = 'digit-cell';
            const colFromRight = paddedStr.length - 1 - i;
            cell.innerHTML = digit === ' ' ? '&nbsp;' : digit;

            if (type === 'numA' && carries && carries[colFromRight]) {
                 const carrySpan = document.createElement('span');
                 carrySpan.className = 'carry-digit';
                 carrySpan.textContent = carries[colFromRight];
                 cell.appendChild(carrySpan);
            }
            if (highlightDigits.includes(colFromRight)) {
                cell.classList.add('highlight-digit');
            }
            row.appendChild(cell);
        }
        return row;
    };

    element.appendChild(createRow(numA, { type: 'numA', highlightDigits: highlights.numA || [] }));
    element.appendChild(createRow(numB, { type: 'numB', highlightDigits: highlights.numB || [] }));
    const line1 = document.createElement('div');
    line1.className = 'calc-line';
    element.appendChild(line1);

    partialProducts.forEach(pp => {
        element.appendChild(createRow(pp.value, { shift: pp.shift }));
    });
    if (currentPartialProduct && currentPartialProduct.value) {
         element.appendChild(createRow(currentPartialProduct.value, { shift: currentPartialProduct.shift, highlightDigits: highlights.current || [] }));
    }

    if (finalSum) {
        const line2 = document.createElement('div');
        line2.className = 'calc-line';
        element.appendChild(line2);
        element.appendChild(createRow(finalSum));
    }
}

async function displayMultiplication(a, b, element) {
    try {
        const product = a * b;
        let aStr = a.toString(), bStr = b.toString();

        let state = {
            numA: aStr, numB: bStr,
            partialProducts: [], currentPartialProduct: null, finalSum: '',
            highlights: { numA: [], numB: [] }, carries: {}
        };

        renderMultiplicationState(element, state); await sleep();

        for (let i = 0; i < bStr.length; i++) {
            const bDigitIndexFromRight = bStr.length - 1 - i;
            const bDigit = parseInt(bStr[bDigitIndexFromRight]);
            state.highlights = { numA: [], numB: [i] };
            state.carries = {};
            state.currentPartialProduct = { value: '', shift: i };
            renderMultiplicationState(element, state); await sleep();

            let carry = 0;
            for(let j = 0; j < aStr.length || carry > 0; j++) {
                state.highlights.numA = [j];
                renderMultiplicationState(element, state); await sleep();

                const aDigit = parseInt(aStr[aStr.length - 1 - j] || '0');
                const stepProduct = aDigit * bDigit + carry;
                const resultDigit = stepProduct % 10;
                carry = Math.floor(stepProduct / 10);

                state.currentPartialProduct.value = resultDigit.toString() + state.currentPartialProduct.value;
                if (carry > 0) state.carries[j + 1] = carry; else delete state.carries[j + 1];

                state.highlights.numA = [];
                renderMultiplicationState(element, state); await sleep(0.5);
            }

            state.partialProducts.push(state.currentPartialProduct);
            state.currentPartialProduct = null;
            state.highlights = { numA: [], numB: [] };
            state.carries = {};
            renderMultiplicationState(element, state); await sleep();
        }

        if (state.partialProducts.length > 1) {
            state.finalSum = ' '; // Trigger line render
            renderMultiplicationState(element, state); await sleep();
        }

        state.finalSum = product.toString();
        renderMultiplicationState(element, state);

        return product;
     } catch (e) { if(e !== 'Cancelled') console.error(e); }
}

async function displayDivision(dividend, divisor, element) {
    try {
        if (divisor === 0) { element.innerHTML = '除數不能是 0 喔！'; return "錯誤"; }
        const finalQuotient = Math.floor(dividend / divisor), finalRemainder = dividend % divisor;
        if (dividend < divisor) { element.innerHTML = `<div class="text-xl text-right p-4 font-mono">${dividend} ÷ ${divisor} = 0 ... ${dividend}</div>`; return `${finalQuotient}...${finalRemainder}`; }

        const dividendStr = String(dividend), divisorStr = String(divisor);
        let state = { divisor: divisorStr.split(''), dividend: dividendStr.split(''), quotient: Array(dividendStr.length).fill(' '), steps: [], highlights: { quotient: [], dividend: [], steps: {} } };
        const clearHighlights = () => state.highlights = { quotient: [], dividend: [], steps: {} };

        renderDivision(element, state); await sleep(0.75);

        let remainderStr = '', hasStarted = false;
        for (let i = 0; i < dividendStr.length; i++) {
            const currentWorkStr = (remainderStr.replace(/^0+/, '') + dividendStr[i]);
            const currentWorkNum = Number(currentWorkStr);
            const rightmostWorkCoord = dividendStr.length - 1 - i;

            if (currentWorkNum < divisor) { 
                if (hasStarted) { state.quotient[i] = '0'; renderDivision(element, state); await sleep(0.5); } 
                remainderStr = currentWorkStr; continue; 
            }

            hasStarted = true;

            if (i > 0 && state.steps.length > 0) {
                const lastStep = state.steps[state.steps.length - 1];
                if (lastStep?.type === 'remainder') {
                    lastStep.value = currentWorkStr; lastStep.coord = rightmostWorkCoord;
                    clearHighlights(); 
                    const workStrLen = currentWorkStr.length;
                    state.highlights.steps[state.steps.length-1] = Array.from({length: workStrLen}, (_,k) => rightmostWorkCoord - (workStrLen - 1 - k));
                    renderDivision(element, state); await sleep();
                }
            }

            const qDigit = Math.floor(currentWorkNum / divisor);
            state.quotient[i] = String(qDigit); clearHighlights(); state.highlights.quotient = [rightmostWorkCoord];
            renderDivision(element, state); await sleep();

            const product = qDigit * divisor;
            const productStr = String(product);
            const productStepIndex = state.steps.length;
            state.steps.push({ type: 'product', value: productStr, coord: rightmostWorkCoord });
            clearHighlights(); 
            const productStrLen = productStr.length;
            state.highlights.steps[productStepIndex] = Array.from({length: productStrLen}, (_,k) => rightmostWorkCoord - (productStrLen - 1 - k));
            renderDivision(element, state); await sleep();

            state.steps.push({ type: 'line', length: Math.max(currentWorkStr.length, productStr.length), coord: rightmostWorkCoord });
            renderDivision(element, state); await sleep(0.5);

            remainderStr = String(currentWorkNum - product);
            const remainderStepIndex = state.steps.length;
            state.steps.push({ type: 'remainder', value: remainderStr, coord: rightmostWorkCoord });
            clearHighlights(); 
            const remainderStrLen = remainderStr.length;
            state.highlights.steps[remainderStepIndex] = Array.from({length: remainderStrLen}, (_,k) => rightmostWorkCoord - (remainderStrLen - 1 - k));
            renderDivision(element, state); await sleep();
        }
        return `${finalQuotient}...${finalRemainder}`;
    } catch (e) { if(e !== 'Cancelled') console.error(e); }
}

// --- Render Functions ---
function renderCalculationState(element, state) {
    if (!element || !state) return;
    element.innerHTML = ''; 
    const { numA, numB, operator, result, carries, borrows, highlights, showLine } = state;
    const displayLen = Math.max(numA.length, numB.length, result.length) + 2;
    const createRow = (numStr, type) => {
        const row = document.createElement('div'); row.className = 'calc-row';
        const opCell = document.createElement('div'); opCell.className = 'digit-cell';
        if (type === 'numB') opCell.textContent = {'+': '+', '-': '−', '*': '×', '/': '÷'}[operator];
        row.appendChild(opCell);
        const fullNumStr = numStr.padStart(displayLen - 1, ' ');
        for (let i = 0; i < fullNumStr.length; i++) {
            const digit = fullNumStr[i];
            const cell = document.createElement('div'); cell.className = 'digit-cell';
            const colFromRight = fullNumStr.length - 1 - i;
            if (type === 'numA' && borrows[colFromRight]) {
                const { original, current } = borrows[colFromRight];
                cell.innerHTML = `<span class="original-digit">${original}</span><span class="new-digit">${current}</span>`;
            } else { cell.innerHTML = digit === ' ' ? '&nbsp;' : digit; }
            if (type === 'numA' && carries[colFromRight]) {
                 cell.innerHTML += `<span class="carry-digit">${carries[colFromRight]}</span>`;
            }
            if (highlights.includes(colFromRight)) { cell.classList.add('highlight-digit'); }
            row.appendChild(cell);
        }
        return row;
    };
    element.appendChild(createRow(numA, 'numA'));
    element.appendChild(createRow(numB, 'numB'));
    if (showLine) {
        const line = document.createElement('div');
        line.className = 'calc-line';
        element.appendChild(line);
        element.appendChild(createRow(result, 'result'));
    }
}

function renderDivision(element, state) {
    element.innerHTML = '';
    element.className = 'division-grid';
    const { divisor, dividend, quotient, steps, highlights } = state;
    const totalCols = divisor.length + 1 + dividend.length;
    element.style.gridTemplateColumns = `repeat(${totalCols}, 1.5ch)`;

    const placeCell = (value, row, col, className = '', isHighlight = false) => {
        const cell = document.createElement('div');
        cell.className = 'digit-cell ' + className;
        if (isHighlight) cell.classList.add('highlight-digit');
        cell.innerHTML = value === ' ' ? '&nbsp;' : value;
        cell.style.gridRow = row;
        cell.style.gridColumn = col;
        element.appendChild(cell);
    };

    const getCol = (coord) => totalCols - coord;

    quotient.forEach((q, i) => { if (q !== ' ') placeCell(q, 1, getCol(dividend.length - 1 - i), '', highlights.quotient.includes(dividend.length - 1 - i)); });
    divisor.forEach((d, i) => placeCell(d, 2, i + 1));
    placeCell(')', 2, divisor.length + 1, 'divisor-bracket');
    dividend.forEach((d, i) => placeCell(d, 2, getCol(dividend.length - 1 - i), 'dividend-digit', highlights.dividend.includes(dividend.length - 1 - i)));

    let currentRow = 3;
    steps.forEach((step, stepIndex) => {
        if (step.type === 'line') {
            const line = document.createElement('div');
            line.className = 'division-step-line';
            line.style.gridRow = currentRow;
            const numberAbove = steps[stepIndex-1];
            const rightmostCoord = numberAbove.coord;
            const leftmostCoord = rightmostCoord + (numberAbove.value.length - 1);
            line.style.gridColumn = `${getCol(leftmostCoord)} / span ${step.length}`;
            element.appendChild(line);
        } else {
            const valueStr = step.value;
            const valueLen = valueStr.length;
            const rightmostCoord = step.coord;
            valueStr.split('').forEach((digit, i) => {
                // **FIXED COORDINATE LOGIC**
                const digitCoord = rightmostCoord + (valueLen - 1 - i);
                const isHighlight = (highlights.steps[stepIndex] || []).includes(digitCoord);
                placeCell(digit, currentRow, getCol(digitCoord), step.type === 'product' ? 'product-digit' : '', isHighlight);
            });
            currentRow++;
        }
    });
}
