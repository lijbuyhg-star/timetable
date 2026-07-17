// 雲端資料庫 Supabase 金鑰設定
const SUPABASE_URL = 'https://hkrdrmgfumxmuujjmtwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcmRybWdmdW14bXV1amptdHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyODgzMzgsImV4cCI6MjA5OTg2NDMzOH0.NfAigDfYgdJXVLyTyAQ5D-xaMzbb6f1mmTUCjThZWK4';
const SCHEDULE_ID = 'global_schedule';

// 預設基本資料結構
const DEFAULT_MODULES = [
    { text: "📸 景點", color: "#22c55e" },
    { text: "🍜 美食", color: "#f97316" },
    { text: "🚆 交通", color: "#3b82f6" }
];
const DEFAULT_TIME_SLOTS = ["08:00 - 10:00", "10:00 - 12:00", "12:00 - 14:00", "14:00 - 16:00", "16:00 - 18:00", "18:00 - 20:00", "20:00 - 22:00"];

// 核心本地狀態資料
let travelData = { 
    modules: [...DEFAULT_MODULES], 
    cells: {}, // 格式為 "天數-列索引"，例如 "1-0" 代表 Day 1 第一格, "2-0" 代表 Day 2 第一格
    timeSlotsDay1: [...DEFAULT_TIME_SLOTS],
    timeSlotsDay2: [...DEFAULT_TIME_SLOTS]  // 確保第二天擁有完全獨立的時間段
};

let currentDay = 1; // 當前正在檢視的天數 (1 或 2)
let currentColor = '#22c55e'; 
let currentText = '📸 景點';       
let supabaseClient = null; 

// 拖拽專用指標狀態
let isDragging = false;
let draggedData = null;
let dragPreviewEl = null;
let lastHoveredCell = null;
let startX = 0, startY = 0;

// 更新同步狀態訊息
const updateStatus = (msg) => { document.getElementById('sync-status').textContent = msg; };

// 🛡️ 防禦與結構修復核心 (升級版)
function validateAndRepairData() {
    if (!travelData || typeof travelData !== 'object') {
        travelData = { modules: [...DEFAULT_MODULES], cells: {}, timeSlotsDay1: [...DEFAULT_TIME_SLOTS], timeSlotsDay2: [...DEFAULT_TIME_SLOTS] };
    }
    if (!travelData.cells || typeof travelData.cells !== 'object' || Array.isArray(travelData.cells)) {
        travelData.cells = {};
    }
    if (!travelData.modules || !Array.isArray(travelData.modules) || travelData.modules.length === 0) {
        travelData.modules = [...DEFAULT_MODULES];
    } else {
        travelData.modules = travelData.modules.map(m => {
            if (typeof m === 'string') return { text: m, color: '#3b82f6' };
            if (m && m.text) return m;
            return null;
        }).filter(Boolean);
        if (travelData.modules.length === 0) travelData.modules = [...DEFAULT_MODULES];
    }
    if (!travelData.timeSlotsDay1 || !Array.isArray(travelData.timeSlotsDay1)) {
        travelData.timeSlotsDay1 = [...DEFAULT_TIME_SLOTS];
    }
    if (!travelData.timeSlotsDay2 || !Array.isArray(travelData.timeSlotsDay2)) {
        travelData.timeSlotsDay2 = [...DEFAULT_TIME_SLOTS];
    }
}

// 數據安全融合與比對判斷
function safeMergeData(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    let oldSlotsStr = JSON.stringify(travelData.timeSlotsDay1) + JSON.stringify(travelData.timeSlotsDay2);
    
    if (incoming.cells && typeof incoming.cells === 'object' && !Array.isArray(incoming.cells)) {
        travelData.cells = incoming.cells;
    }
    if (incoming.modules && Array.isArray(incoming.modules)) {
        travelData.modules = incoming.modules;
    }
    if (incoming.timeSlotsDay1 && Array.isArray(incoming.timeSlotsDay1)) {
        travelData.timeSlotsDay1 = incoming.timeSlotsDay1;
    }
    // 相容並升級舊版或讀取新版 Day 2
    if (incoming.timeSlotsDay2 && Array.isArray(incoming.timeSlotsDay2)) {
        travelData.timeSlotsDay2 = incoming.timeSlotsDay2;
    } else if (incoming.timeSlots && Array.isArray(incoming.timeSlots)) {
        travelData.timeSlotsDay2 = incoming.timeSlots; // 舊結構平滑轉移
    }
    
    validateAndRepairData();
    let newSlotsStr = JSON.stringify(travelData.timeSlotsDay1) + JSON.stringify(travelData.timeSlotsDay2);
    return oldSlotsStr !== newSlotsStr ? "rebuild" : true;
}

// 天數切換核心邏輯
function switchDay(dayNum) {
    currentDay = dayNum;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-day${dayNum}`).classList.add('active');
    document.getElementById('schedule-header').textContent = `Day ${dayNum} 行程內容`;
    
    // 依據新天數重新構建表格與渲染格子
    initTableRows();
    renderCellsVisual();
}

// 動態繪製與切換單日表格結構
function initTableRows() {
    const tbody = document.getElementById('schedule-body');
    if (!tbody) return; 
    tbody.innerHTML = '';
    
    // 依據當前選定的天數，抽取其獨立的時間數組
    const currentSlots = currentDay === 1 ? travelData.timeSlotsDay1 : travelData.timeSlotsDay2;
    
    currentSlots.forEach((time, rowIndex) => {
        const tr = document.createElement('tr');
        const tdTime = document.createElement('td');
        tdTime.className = 'time-col';
        
        const select = document.createElement('select');
        select.className = 'time-select';
        select.id = `cell-select-${rowIndex}`;
        
        const options = [
            "06:00 - 08:00", "07:00 - 09:00", "08:00 - 10:00", "09:00 - 11:00",
            "10:00 - 12:00", "11:00 - 13:00", "12:00 - 14:00", "13:00 - 15:00",
            "14:00 - 16:00", "15:00 - 17:00", "16:00 - 18:00", "17:00 - 19:00",
            "18:00 - 20:00", "19:00 - 21:00", "20:00 - 22:00", "21:00 - 23:00",
            "22:00 - 00:00", "00:00 - 03:00", "03:00 - 06:00"
        ];
        
        if (!options.includes(time)) options.unshift(time);
        
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt;
            if (opt === time) o.selected = true;
            select.appendChild(o);
        });
        
        select.addEventListener('change', (e) => {
            if (currentDay === 1) {
                travelData.timeSlotsDay1[rowIndex] = e.target.value;
            } else {
                travelData.timeSlotsDay2[rowIndex] = e.target.value;
            }
            saveDataToCloud();
        });
        
        tdTime.appendChild(select);
        tr.appendChild(tdTime);

        // 僅生成當前選定天數的格子 (手機觀看極其順暢)
        const td = document.createElement('td');
        td.className = 'cell empty';
        td.id = `cell-${currentDay}-${rowIndex}`; // 精準隔離天數與列數
        
        bindCellDragAndClickEvents(td, currentDay, rowIndex);

        td.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const key = `${currentDay}-${rowIndex}`;
            const cellData = travelData.cells[key];
            if (cellData) handleCellFill(key, cellData.module, cellData.color, true);
        });

        tr.appendChild(td);
        tbody.appendChild(tr);
    });
}

// 綁定格子的拖拽與點擊快速填色事件
function bindCellDragAndClickEvents(td, dayNum, rowIndex) {
    const key = `${dayNum}-${rowIndex}`;
    const handleStart = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        const cellData = travelData.cells[key];
        const pos = getCoords(e);
        let startXPos = pos.x; let startYPos = pos.y;
        let isMoveThresholdPassed = false;
        
        const handleMove = (moveEvent) => {
            const movePos = getCoords(moveEvent);
            const dist = Math.sqrt(Math.pow(movePos.x - startXPos, 2) + Math.pow(movePos.y - startYPos, 2));
            if (dist > 8 && !isMoveThresholdPassed) {
                isMoveThresholdPassed = true;
                cleanup();
                if (cellData) {
                    if (moveEvent.cancelable) moveEvent.preventDefault();
                    activateDrag(td, cellData.module, cellData.color, false, cellData.detail || "", key, moveEvent);
                }
            }
        };
        const handleEnd = (endEvent) => {
            cleanup();
            if (!isMoveThresholdPassed) {
                if (currentText !== "" && currentColor !== "") {
                    handleCellFill(key, currentText, currentColor, false);
                }
            }
        };
        const cleanup = () => {
            document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove); document.removeEventListener('touchend', handleEnd);
        };
        if (e.type === 'mousedown') {
            document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleEnd);
        } else {
            document.addEventListener('touchmove', handleMove, { passive: false }); document.addEventListener('touchend', handleEnd);
        }
    };
    td.addEventListener('mousedown', handleStart);
    td.addEventListener('touchstart', handleStart, { passive: true });
}

// 執行格子的資料填入或彈窗備註
function handleCellFill(key, text, color, forcePrompt = false) {
    if (text === "__eraser__" || color === "") {
        delete travelData.cells[key];
        renderCellsVisual(); saveDataToCloud(); return;
    }
    const oldDetail = (travelData.cells[key] && travelData.cells[key].detail) ? travelData.cells[key].detail : "";
    let detail = oldDetail;
    if (forcePrompt) {
        const userText = prompt(`欲修改【${text}】內部的詳細行程：`, oldDetail);
        if (userText === null) return;
        detail = userText;
    }
    travelData.cells[key] = { module: text, detail: detail, color: color };
    renderCellsVisual(); saveDataToCloud();
}

// 視覺渲染更新函數
function renderCellsVisual() {
    if (!travelData.cells) travelData.cells = {};
    document.querySelectorAll('.cell').forEach(td => {
        const key = td.id.replace('cell-', '');
        const cellData = travelData.cells[key];
        if (cellData && typeof cellData === 'object') {
            td.style.backgroundColor = cellData.color || '#3b82f6';
            td.innerHTML = cellData.detail ? `<div style="font-size: 0.72em; opacity: 0.85; margin-bottom:1px;">${cellData.module || ''}</div><div style="font-size: 0.85em;">${cellData.detail}</div>` : `<div style="font-size: 0.85em;">${cellData.module || ''}</div>`;
            td.classList.remove('empty');
        } else {
            td.style.backgroundColor = ''; td.innerHTML = ''; td.classList.add('empty');
        }
    });
}

function renderTimeSlotsVisual() {
    const currentSlots = currentDay === 1 ? travelData.timeSlotsDay1 : travelData.timeSlotsDay2;
    if (!currentSlots) return;
    currentSlots.forEach((time, rowIndex) => {
        const select = document.getElementById(`cell-select-${rowIndex}`);
        if (select && select.value !== time) {
            if (![...select.options].some(o => o.value === time)) {
                const o = document.createElement('option');
                o.value = time; o.textContent = time;
                select.add(o, 0);
            }
            select.value = time;
        }
    });
}

function renderModules() {
    const container = document.getElementById('module-list');
    if (!container) return; container.innerHTML = '';
    
    travelData.modules.forEach((m, index) => {
        if (!m || !m.text) return;
        const div = document.createElement('div');
        div.className = 'module';
        div.style.backgroundColor = m.color || '#3b82f6';
        div.setAttribute('data-text', m.text);
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = m.text;
        div.appendChild(titleSpan);

        const delBtn = document.createElement('span');
        delBtn.className = 'del-mod-btn';
        delBtn.innerHTML = '&times;';
        const stopBubble = (e) => e.stopPropagation();
        delBtn.addEventListener('mousedown', stopBubble); delBtn.addEventListener('touchstart', stopBubble);

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            travelData.modules.splice(index, 1);
            if (currentText === m.text) {
                if (travelData.modules.length > 0) {
                    currentText = travelData.modules[0].text; currentColor = travelData.modules[0].color;
                } else { currentText = ""; currentColor = ""; }
            }
            renderModules(); saveDataToCloud();
        });

        div.appendChild(delBtn);
        bindDragEvents(div, m.text, m.color, false);
        container.appendChild(div);
    });

    const eraser = document.createElement('div');
    eraser.className = 'module eraser'; eraser.textContent = "🧹 清除";
    bindDragEvents(eraser, "", "", true); container.appendChild(eraser);
    updateActiveModuleUI();
}

function updateActiveModuleUI() {
    document.querySelectorAll('.module').forEach(el => el.classList.remove('active'));
    const container = document.getElementById('module-list'); if(!container) return;
    container.querySelectorAll('.module').forEach(el => {
        if(el.classList.contains('eraser') && currentColor === "") el.classList.add('active');
        else if (!el.classList.contains('eraser') && el.getAttribute('data-text') === currentText) el.classList.add('active');
    });
}

// 取得滑鼠或觸控位置的共用函式
function getCoords(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
}

// 激活拖曳（產生漂浮預覽區塊）
function activateDrag(element, text, color, isEraser, detail = "", srcKey = null, initialEvent) {
    isDragging = true; draggedData = { text: isEraser ? "__eraser__" : text, color: color, detail: detail, srcKey: srcKey };
    const pos = getCoords(initialEvent); startX = pos.x; startY = pos.y;
    dragPreviewEl = document.createElement('div'); dragPreviewEl.className = 'module';
    dragPreviewEl.style.backgroundColor = color || '#3b82f6'; dragPreviewEl.textContent = text;
    dragPreviewEl.style.position = 'fixed'; dragPreviewEl.style.zIndex = '10000'; dragPreviewEl.style.opacity = '0.85';
    dragPreviewEl.style.pointerEvents = 'none'; dragPreviewEl.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    document.body.appendChild(dragPreviewEl); updatePreviewPos(pos.x, pos.y);

    if (initialEvent.type.startsWith('mouse')) {
        document.addEventListener('mousemove', onGlobalMove); document.addEventListener('mouseup', onGlobalEnd);
    } else {
        document.addEventListener('touchmove', onGlobalMove, { passive: false });
        document.addEventListener('touchend', onGlobalEnd); document.addEventListener('touchcancel', onGlobalEnd);
    }
}

function bindDragEvents(element, text, color, isEraser = false) {
    element.addEventListener('mousedown', (e) => { if (e.button !== 0) return; e.preventDefault(); activateDrag(element, text, color, isEraser, "", null, e); });
    element.addEventListener('touchstart', (e) => { e.preventDefault(); activateDrag(element, text, color, isEraser, "", null, e); }, { passive: false });
}

function updatePreviewPos(x, y) {
    if (!dragPreviewEl) return;
    dragPreviewEl.style.left = (x - dragPreviewEl.offsetWidth / 2) + 'px';
    dragPreviewEl.style.top = (y - dragPreviewEl.offsetHeight / 2) + 'px';
}

// 全域拖拽移動監聽
function onGlobalMove(e) {
    if (!isDragging) return; if (e.type === 'touchmove') e.preventDefault();
    const pos = getCoords(e); updatePreviewPos(pos.x, pos.y);
    let targetEl = document.elementFromPoint(pos.x, pos.y);
    let cell = targetEl ? targetEl.closest('.cell') : null;
    if (cell !== lastHoveredCell) {
        if (lastHoveredCell) lastHoveredCell.classList.remove('drag-over');
        if (cell) cell.classList.add('drag-over');
        lastHoveredCell = cell;
    }
}

// 全域拖拽放開滑鼠事件
function onGlobalEnd(e) {
    if (!isDragging) return; isDragging = false;
    if (lastHoveredCell) lastHoveredCell.classList.remove('drag-over');
    const pos = getCoords(e);
    let targetEl = document.elementFromPoint(pos.x, pos.y);
    let cell = targetEl ? targetEl.closest('.cell') : null;
    let moveDist = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
    
    if (moveDist < 8 && !draggedData.srcKey) {
        if (draggedData.text === "__eraser__") { currentColor = ""; currentText = ""; }
        else { currentColor = draggedData.color; currentText = draggedData.text; }
        updateActiveModuleUI();
    } else if (cell && draggedData) {
        const targetKey = cell.id.replace('cell-', '');
        if (draggedData.text === "__eraser__") { delete travelData.cells[targetKey]; }
        else { travelData.cells[targetKey] = { module: draggedData.text, color: draggedData.color, detail: draggedData.detail || "" }; }
        if (draggedData.srcKey && draggedData.srcKey !== targetKey) { delete travelData.cells[draggedData.srcKey]; }
        renderCellsVisual(); saveDataToCloud();
    }
    if (dragPreviewEl) { dragPreviewEl.remove(); dragPreviewEl = null; }
    draggedData = null; lastHoveredCell = null;
    document.removeEventListener('mousemove', onGlobalMove); document.removeEventListener('mouseup', onGlobalEnd);
    document.removeEventListener('touchmove', onGlobalMove); document.removeEventListener('touchend', onGlobalEnd);
}

// 頁籤按鈕點擊接聽
document.getElementById('tab-day1').addEventListener('click', () => switchDay(1));
document.getElementById('tab-day2').addEventListener('click', () => switchDay(2));

// 調色盤事件綁定
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        const selectedColor = dot.getAttribute('data-color');
        document.getElementById('new-color').value = selectedColor; currentColor = selectedColor;
    });
});
document.getElementById('new-color').addEventListener('input', (e) => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    currentColor = e.target.value;
});

// ➕ 按鈕事件：主動新增客製化行程標籤
document.getElementById('add-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('new-name');
    const name = nameInput.value.trim();
    if (!name) return alert("請輸入行程名稱！");

    travelData.modules.push({ text: name, color: currentColor });
    currentText = name; 
    renderModules(); 
    saveDataToCloud();
    nameInput.value = '';
});

// 🔒 密碼防禦：強制清洗重設全域髒數據結構
document.getElementById('reset-btn').addEventListener('click', () => {
    const password = prompt("🔒 此功能為敏感操作，請輸入管理密碼以確認全域重設：");
    if (password === null) return; 
    if (password !== "88888888") { return alert("❌ 密碼錯誤！拒絕全域強制重設。"); }

    const isConfirmed = confirm("⚠️ 是否確認要「徹底強制清洗重設所有資料」？\n\n這將清空所有網頁格子、還原預設時間段、還原預設行程模塊，並使用全新正確的結構覆蓋並修復雲端資料庫！");
    if (isConfirmed) {
        travelData = { 
            modules: [
                { text: "📸 景點", color: "#22c55e" },
                { text: "🍜 美食", color: "#f97316" },
                { text: "🚆 交通", color: "#3b82f6" }
            ], 
            cells: {},
            timeSlotsDay1: [...DEFAULT_TIME_SLOTS],
            timeSlotsDay2: [...DEFAULT_TIME_SLOTS]
        };
        initTableRows(); renderCellsVisual(); renderModules(); saveDataToCloud();
        updateStatus("🔄 整個時間表與雲端髒數據結構已徹底清空與強制修復！");
    }
});

// 備份到本地 LocalStorage 與推送到 Supabase
async function saveDataToCloud() {
    try { localStorage.setItem('backup_travel_data', JSON.stringify(travelData)); } catch(e){}
    if (!supabaseClient) return;
    try {
        await supabaseClient.from('travel_schedules').upsert({ id: SCHEDULE_ID, data: travelData });
        updateStatus("✅ 雲端即時同步成功！");
    } catch (e) {}
}

// 自雲端抓取最新排班結構
async function loadDataFromCloud() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('travel_schedules').select('data').eq('id', SCHEDULE_ID).single();
        if (!error && data && data.data) {
            const mergeResult = safeMergeData(data.data);
            if (mergeResult === "rebuild") { initTableRows(); }
            renderCellsVisual(); renderTimeSlotsVisual(); renderModules();
            updateStatus("✅ 已成功連線雲端資料庫並同步");
        }
    } catch(e) {}
}

// 🚀 啟動：首輪安全初始化
validateAndRepairData();
initTableRows(); 
renderCellsVisual(); 
renderModules();     

// 讀取本地緩存備份
try {
    const localBackup = localStorage.getItem('backup_travel_data');
    if (localBackup) { 
        const mergeResult = safeMergeData(JSON.parse(localBackup)); 
        if (mergeResult === "rebuild") { initTableRows(); }
        renderCellsVisual(); renderTimeSlotsVisual(); renderModules(); 
    }
} catch(e){}

// 雲端 SDK 動態注入與多端輪詢（每 4 秒）
function injectSupabaseSDK() {
    updateStatus("⏳ 嘗試同步雲端中...");
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; script.async = true;
    script.onload = function() {
        try {
            if (window.supabase) {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                loadDataFromCloud();
                
                // 即時動態輪詢同源更新
                setInterval(async () => {
                    if (!supabaseClient || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || isDragging) return;
                    try {
                        const { data } = await supabaseClient.from('travel_schedules').select('data').eq('id', SCHEDULE_ID).single();
                        if (data && data.data) { 
                            const mergeResult = safeMergeData(data.data); 
                            if (mergeResult === "rebuild") { initTableRows(); }
                            renderCellsVisual(); renderTimeSlotsVisual(); renderModules();
                        }
                    } catch (e) {}
                }, 4000);
            }
        } catch(e) { updateStatus("運作中 (本地獨立安全模式)"); }
    };
    script.onerror = function() { updateStatus("運作中 (本地儲存模式)"); };
    document.body.appendChild(script);
}
setTimeout(injectSupabaseSDK, 300);