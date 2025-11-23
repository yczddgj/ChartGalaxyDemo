let currentDataFile = '';
let selectedReference = '';
let selectedVariation = '';
let selectedTitle = '';
let selectedTitleIndex = 0;
let selectedPictogram = '';

// 数据选择变化事件
document.getElementById('dataSelect').addEventListener('change', function() {
    const selectedFile = this.value;
    if (selectedFile) {
        loadData(selectedFile);
        currentDataFile = selectedFile;
    } else {
        hideAllCards();
    }
});

// 隐藏所有卡片
function hideAllCards() {
    document.getElementById('dataPreview').classList.add('hidden');
    document.getElementById('referenceCard').classList.add('hidden');
    document.getElementById('chartTypeCard').classList.add('hidden');
    document.getElementById('variationCard').classList.add('hidden');
    document.getElementById('titleCard').classList.add('hidden');
    document.getElementById('pictogramCard').classList.add('hidden');
    document.getElementById('resultCard').classList.add('hidden');

    // 重置选择状态
    selectedReference = '';
    selectedChartType = '';
    selectedVariation = '';
    selectedTitle = '';
    selectedTitleIndex = 0;
    selectedPictogram = '';
}

function hideCards(cards) {
    cards.forEach(card => {
        const element = document.getElementById(card);
        if (element) {  // 检查元素是否存在
            element.classList.add('hidden');
            console.info(`hide "${card}"`);
        } else {
            console.info(`Element with ID "${card}" not found.`);
        }
    });

    // 重置选择状态

    // selectedReference = '';
    // selectedVariation = '';
    // selectedTitle = '';
    // selectedTitleIndex = 0;
    // selectedPictogram = '';
}


// 轮询检测图片是否存在（HEAD 请求）
async function waitForImage(url, maxAttempts = 1000, interval = 500) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (res.ok) return true;
        } catch (e) {
            // 忽略错误继续尝试
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    return false;
}

// 替换图片为真实图像（检测成功后调用）
async function loadImageWhenReady(imgElement, imgUrl) {
    const found = await waitForImage(imgUrl);
    if (found) {
        imgElement.src = imgUrl;
    } else {
        imgElement.alt = '图片加载失败';
        console.warn(`图片未生成：${imgUrl}`);
    }
}



// 加载数据
async function loadData(filename) {
    try {
        const response = await fetch(`/api/data/${filename}`);
        const result = await response.json();

        if (result.columns && result.data) {
            displayTable(result.columns, result.data);
            document.getElementById('dataPreview').classList.remove('hidden');
            document.getElementById('referenceCard').classList.add('hidden');
            document.getElementById('chartTypeCard').classList.add('hidden');
            document.getElementById('variationCard').classList.add('hidden');
            document.getElementById('titleCard').classList.add('hidden');
            document.getElementById('pictogramCard').classList.add('hidden');
            document.getElementById('resultCard').classList.add('hidden');
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        alert('加载数据失败，请重试');
    }
}

// 显示表格
function displayTable(columns, data) {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    
    // 清空现有内容
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    // 创建表头
    const headerRow = document.createElement('tr');
    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // 创建表格行
    data.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = row[column] || '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}


// 生成最终信息图表
async function generateFinalInfographic() {
    if (!selectedPictogram) {
        alert('请先选择一个配图');
        return;
    }

    const charttype = selectedVariation;
    const data = currentDataFile.replace('.csv', '');;
    
    if (!charttype || !data) {
        alert('请先选择数据和图表类型');
        return;
    }
    
    // 跳转到 ChartGalaxy 主页面，并且带上 charttype 和 data 参数
    // 假设那个页面叫 index.html，如果部署在根路径就直接写 /index.html
    const url = `/authoring/generate_final?charttype=${charttype}&data=${data}&title=${selectedTitle}&pictogram=${selectedPictogram}`
    window.location.href = url;
    // 显示加载overlay
    // document.getElementById('loadingOverlay').style.display = 'flex';
    // document.getElementById('selectPictogramBtn').disabled = true;

    // try {
    //     // 构建请求URL，对于Art演示需要传递选择的标题索引
    //     let apiUrl = `/api/generate_final/${currentDataFile}`;
    //     if (isArtDemo && selectedTitleIndex) {
    //         apiUrl += `?selected_title_index=${selectedTitleIndex}`;
    //     }
        
    //     // 开始最终生成
    //     const response = await fetch(apiUrl);
    //     const result = await response.json();
        
    //     if (result.error) {
    //         alert(result.error);
    //         return;
    //     }

    //     // 轮询状态
    //     checkFinalGenerationStatus();
        
    // } catch (error) {
    //     console.error('最终生成失败:', error);
    //     alert('最终生成失败，请重试');
    //     hideLoading();
    // }
}

// 检查最终生成状态
async function checkFinalGenerationStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        
        document.getElementById('loadingText').textContent = status.progress || '处理中...';
        
        if (status.step === 'final_result' && status.completed && status.image_name) {
            // 最终生成完成
            setTimeout(() => {
                showResult(status.image_name);
                hideLoading();
            }, 500);
        } else if (status.status === 'processing') {
            // 继续轮询
            setTimeout(checkFinalGenerationStatus, 500);
        } else {
            hideLoading();
        }
    } catch (error) {
        console.error('状态检查失败:', error);
        hideLoading();
    }
}

// 显示结果
function showResult(imageName) {
    const resultImage = document.getElementById('resultImage');
    resultImage.src = `/infographics/${imageName}`;
    
    const resultCard = document.getElementById('resultCard');
    resultCard.classList.remove('hidden');
    resultCard.classList.add('fade-in');
    
    // 滚动到结果
    resultCard.scrollIntoView({ behavior: 'smooth' });
}

// 下载生成的结果图片
function downloadResult() {
    const resultImage = document.getElementById('resultImage');
    const imageSrc = resultImage.src;

    if (!imageSrc) {
        alert('没有可下载的图片');
        return;
    }

    // 创建一个临时的a标签来触发下载
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = 'infographic_' + new Date().getTime() + '.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 隐藏加载界面
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}
