// Chart Type 选择相关功能
// 新流程: 数据选择 -> Chart Type -> Variation -> 参考图表 -> 标题 -> 配图

let selectedChartType = '';
let currentChartSVG = '';  // 存储当前选中的图表SVG内容

// 数据选择后，开始 Chart Type 选择
async function startChartTypeSelection() {
    if (!currentDataFile) {
        alert('请先选择一个数据集');
        return;
    }

    // 显示加载overlay
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = '获取可用图表类型...';
    document.getElementById('nextStepBtn').disabled = true;

    try {
        // 调用 API 获取兼容的 templates
        const response = await fetch(`/api/start_find_reference/${currentDataFile}`);
        const result = await response.json();

        if (result.status === 'started') {
            // 等待处理完成后显示 chart types
            checkStatusForChartTypes();
        }

    } catch (error) {
        console.error('获取图表类型失败:', error);
        alert('获取图表类型失败，请重试');
        hideLoading();
        document.getElementById('nextStepBtn').disabled = false;
    }
}

// 检查状态并在完成后显示 chart types
async function checkStatusForChartTypes() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        if (status.step === 'find_reference' && status.completed) {
            // 获取 templates 完成，显示 chart types
            await showChartTypes();
            hideLoading();
            document.getElementById('nextStepBtn').disabled = false;
        } else if (status.status === 'processing') {
            // 继续轮询
            document.getElementById('loadingText').textContent = status.progress || '处理中...';
            setTimeout(checkStatusForChartTypes, 500);
        } else if (status.status === 'error') {
            alert('处理失败: ' + status.progress);
            hideLoading();
            document.getElementById('nextStepBtn').disabled = false;
        } else {
            setTimeout(checkStatusForChartTypes, 500);
        }
    } catch (error) {
        console.error('状态检查失败:', error);
        hideLoading();
        document.getElementById('nextStepBtn').disabled = false;
    }
}

// 显示 Chart Types（显示预览图）
async function showChartTypes() {
    try {
        const response = await fetch('/api/chart_types');
        const result = await response.json();

        const container = document.getElementById('chartTypeContainer');
        container.innerHTML = '';

        if (result.chart_types && result.chart_types.length > 0) {
            // 显示加载中状态
            document.getElementById('loadingOverlay').style.display = 'flex';
            document.getElementById('loadingText').textContent = '生成图表类型预览...';

            // 调用预览生成 API 并等待完成
            await fetch('/api/chart_types/generate_previews');

            // 等待后端生成完成
            await waitForPreviewsComplete();

            // 隐藏加载状态
            hideLoading();

            result.chart_types.forEach((chartType, index) => {
                const item = document.createElement('div');
                item.className = 'chart-type-item';
                item.setAttribute('data-type', chartType.type);
                item.setAttribute('data-template', chartType.template);

                // 使用 chart type 名称构建预览图路径（空格替换为下划线）
                const chartTypeName = chartType.type.replace(/ /g, '_');

                // 显示预览图和名称
                item.innerHTML = `
                    <div class="chart-type-image-container">
                        <img class="chart-type-image" src="/currentfilepath/charttype_${chartTypeName}.svg?t=${Date.now()}" alt="${chartType.type}">
                    </div>
                    <div class="chart-type-label">${chartType.type}</div>
                `;

                container.appendChild(item);
            });

            // 设置点击事件
            setupChartTypeSelection();
        }

        // 更新按钮状态
        document.getElementById('changeChartTypeBatchBtn').disabled = result.total <= 3;

        // 显示 chart type 卡片
        const chartTypeCard = document.getElementById('chartTypeCard');
        chartTypeCard.classList.remove('hidden');
        chartTypeCard.classList.add('fade-in');
        chartTypeCard.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('获取图表类型失败:', error);
        alert('获取图表类型失败，请重试');
        hideLoading();
    }
}

// 等待预览图生成完成
async function waitForPreviewsComplete() {
    const maxAttempts = 60; // 最多等待30秒
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();

            if (status.completed && (status.step === 'chart_type_preview' || status.step === 'variation_preview')) {
                return true;
            }

            if (status.status === 'error') {
                console.error('预览生成出错:', status.progress);
                return false;
            }

            // 更新加载文字
            if (status.progress) {
                document.getElementById('loadingText').textContent = status.progress;
            }

        } catch (error) {
            console.error('检查状态失败:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }

    console.warn('等待预览生成超时');
    return false;
}

// 加载 chart type 预览图
function loadChartTypePreviews() {
    const images = document.querySelectorAll('.chart-type-image');
    images.forEach(img => {
        const src = img.getAttribute('data-src');
        if (src) {
            loadImageWhenReady(img, src, 0);
        }
    });
}

// 轮询加载图片直到可用
function loadImageWhenReady(imgElement, src, attempts) {
    const maxAttempts = 30; // 最多尝试30次，每次500ms

    fetch(src, { method: 'HEAD' })
        .then(response => {
            if (response.ok) {
                imgElement.src = src + '?t=' + Date.now(); // 添加时间戳防止缓存
            } else if (attempts < maxAttempts) {
                setTimeout(() => loadImageWhenReady(imgElement, src, attempts + 1), 500);
            }
        })
        .catch(() => {
            if (attempts < maxAttempts) {
                setTimeout(() => loadImageWhenReady(imgElement, src, attempts + 1), 500);
            }
        });
}

// 设置 Chart Type 选择事件
function setupChartTypeSelection() {
    const chartTypeItems = document.querySelectorAll('.chart-type-item');
    const selectBtn = document.getElementById('selectChartTypeBtn');

    chartTypeItems.forEach(item => {
        item.addEventListener('click', function() {
            // 移除所有选中状态
            chartTypeItems.forEach(ct => ct.classList.remove('selected'));

            // 检查选择是否改变
            if (selectedChartType != this.getAttribute('data-type') && selectedChartType) {
                hideCards(["variationCard", "referenceCard", "titleCard", "pictogramCard", "resultCard"]);
            }

            // 添加选中状态
            this.classList.add('selected');
            selectedChartType = this.getAttribute('data-type');

            selectBtn.disabled = false;
        });
    });
}

// 加载更多 Chart Types
async function loadMoreChartTypes() {
    document.getElementById('changeChartTypeBatchBtn').disabled = true;

    // 显示加载中状态
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = '加载更多图表类型...';

    try {
        const response = await fetch('/api/chart_types/next');
        const result = await response.json();

        const container = document.getElementById('chartTypeContainer');
        // 不清空容器，追加新内容

        if (result.chart_types && result.chart_types.length > 0) {
            // 调用预览生成 API
            await fetch('/api/chart_types/generate_previews');

            // 等待后端生成完成
            await waitForPreviewsComplete();

            result.chart_types.forEach((chartType, index) => {
                const item = document.createElement('div');
                item.className = 'chart-type-item';
                item.setAttribute('data-type', chartType.type);
                item.setAttribute('data-template', chartType.template);

                // 使用 chart type 名称构建预览图路径（空格替换为下划线）
                const chartTypeName = chartType.type.replace(/ /g, '_');

                // 显示预览图和名称
                item.innerHTML = `
                    <div class="chart-type-image-container">
                        <img class="chart-type-image" src="/currentfilepath/charttype_${chartTypeName}.svg?t=${Date.now()}" alt="${chartType.type}">
                    </div>
                    <div class="chart-type-label">${chartType.type}</div>
                `;

                container.appendChild(item);
            });

            // 重新设置点击事件
            setupChartTypeSelection();
        }

        hideLoading();
        // 如果没有更多内容，禁用按钮
        document.getElementById('changeChartTypeBatchBtn').disabled = !result.has_more;

    } catch (error) {
        console.error('加载更多失败:', error);
        hideLoading();
        document.getElementById('changeChartTypeBatchBtn').disabled = false;
    }
}

// 选择 Chart Type 并显示 Variations
async function selectChartTypeAndShowVariations() {
    if (!selectedChartType) {
        alert('请先选择一个图表类型');
        return;
    }

    // 显示加载overlay
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = '获取图表样式...';
    document.getElementById('selectChartTypeBtn').disabled = true;

    try {
        // 调用 API 选择 chart type
        const selectResponse = await fetch(`/api/chart_types/select/${encodeURIComponent(selectedChartType)}`);
        const selectResult = await selectResponse.json();

        if (selectResult.status === 'selected') {
            // 显示 variations
            await showVariations();
            hideLoading();
        }

    } catch (error) {
        console.error('选择图表类型失败:', error);
        alert('选择图表类型失败，请重试');
        hideLoading();
    }
}

// 显示 Variations（显示预览图）
async function showVariations() {
    try {
        const response = await fetch('/api/variations');
        const result = await response.json();

        const container = document.getElementById('variationContainer');
        container.innerHTML = '';

        if (result.variations && result.variations.length > 0) {
            // 显示加载中状态
            document.getElementById('loadingOverlay').style.display = 'flex';
            document.getElementById('loadingText').textContent = '生成图表样式预览...';

            // 调用预览生成 API
            await fetch('/api/variations/generate_previews');

            // 等待后端生成完成
            await waitForPreviewsComplete();

            // 隐藏加载状态
            hideLoading();

            result.variations.forEach((variation, index) => {
                const item = document.createElement('div');
                item.className = 'variation-item';
                item.setAttribute('data-name', variation.name);
                item.setAttribute('data-template', variation.template);

                // 显示预览图和名称
                item.innerHTML = `
                    <div class="variation-image-container">
                        <img class="variation-image" src="/currentfilepath/variation_${variation.name}.svg?t=${Date.now()}" alt="${variation.name}">
                    </div>
                    <div class="variation-label">${variation.name.replace(/_/g, ' ')}</div>
                `;

                container.appendChild(item);
            });

            // 设置点击事件
            setupNewVariationSelection();
        }

        // 更新按钮状态
        document.getElementById('changeVariationBatchBtn').disabled = result.total <= 3;

        // 显示 variation 卡片
        const variationCard = document.getElementById('variationCard');
        variationCard.classList.remove('hidden');
        variationCard.classList.add('fade-in');
        variationCard.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('获取图表样式失败:', error);
        alert('获取图表样式失败，请重试');
        hideLoading();
    }
}

// 加载 variation 预览图
function loadVariationPreviews() {
    const images = document.querySelectorAll('.variation-image');
    images.forEach(img => {
        const src = img.getAttribute('data-src');
        if (src) {
            loadImageWhenReady(img, src, 0);
        }
    });
}

// 设置 Variation 选择事件
function setupNewVariationSelection() {
    const variationItems = document.querySelectorAll('.variation-item');
    const selectBtn = document.getElementById('selectVariationBtn');

    variationItems.forEach(item => {
        item.addEventListener('click', async function() {
            // 移除所有选中状态
            variationItems.forEach(v => v.classList.remove('selected'));

            // 检查选择是否改变
            if (selectedVariation != this.getAttribute('data-name') && selectedVariation) {
                hideCards(["referenceCard", "titleCard", "pictogramCard", "resultCard"]);
            }

            // 添加选中状态
            this.classList.add('selected');
            selectedVariation = this.getAttribute('data-name');

            // 获取当前选中variation的SVG内容
            try {
                const svgUrl = `/currentfilepath/variation_${selectedVariation}.svg`;
                const response = await fetch(svgUrl);
                if (response.ok) {
                    currentChartSVG = await response.text();
                    console.log('已加载图表SVG内容');
                } else {
                    console.warn('无法加载SVG内容');
                    currentChartSVG = '';
                }
            } catch (error) {
                console.error('获取SVG内容失败:', error);
                currentChartSVG = '';
            }

            selectBtn.disabled = false;
        });
    });
}

// 加载更多 Variations
async function loadMoreVariations() {
    document.getElementById('changeVariationBatchBtn').disabled = true;

    // 显示加载中状态
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = '加载更多图表样式...';

    try {
        const response = await fetch('/api/variations/next');
        const result = await response.json();

        const container = document.getElementById('variationContainer');
        // 不清空容器，追加新内容

        if (result.variations && result.variations.length > 0) {
            // 调用预览生成 API
            await fetch('/api/variations/generate_previews');

            // 等待后端生成完成
            await waitForPreviewsComplete();

            result.variations.forEach((variation, index) => {
                const item = document.createElement('div');
                item.className = 'variation-item';
                item.setAttribute('data-name', variation.name);
                item.setAttribute('data-template', variation.template);

                // 显示预览图和名称
                item.innerHTML = `
                    <div class="variation-image-container">
                        <img class="variation-image" src="/currentfilepath/variation_${variation.name}.svg?t=${Date.now()}" alt="${variation.name}">
                    </div>
                    <div class="variation-label">${variation.name.replace(/_/g, ' ')}</div>
                `;

                container.appendChild(item);
            });

            // 重新设置点击事件
            setupNewVariationSelection();
        }

        hideLoading();
        // 如果没有更多内容，禁用按钮
        document.getElementById('changeVariationBatchBtn').disabled = !result.has_more;

    } catch (error) {
        console.error('加载更多失败:', error);
        hideLoading();
        document.getElementById('changeVariationBatchBtn').disabled = false;
    }
}

// 选择 Variation 并显示参考图表
async function selectVariationAndShowReferences() {
    if (!selectedVariation) {
        alert('请先选择一个图表样式');
        return;
    }

    // 显示参考图表
    await showReferenceImages();
}

// 显示参考图表（从 reference.js 移过来的逻辑）
async function showReferenceImages() {
    try {
        // 获取参考图（基于主题相似性排序）
        const response = await fetch('/api/references');
        const result = await response.json();
        const mainImage = result.main_image;
        const randomImages = result.random_images || [];
        const hasMore = result.has_more || false;

        // 获取容器并清空
        const container = document.getElementById('referenceContainer');
        container.innerHTML = '';

        // 首先添加"AI直接生成"选项
        const aiDirectItem = document.createElement('div');
        aiDirectItem.className = 'reference-item ai-direct-item';
        aiDirectItem.setAttribute('data-ai-direct', 'true');

        aiDirectItem.innerHTML = `
            <div class="reference-image-container ai-direct-container">
                <div class="ai-direct-content">
                    <div class="ai-direct-icon">🤖</div>
                    <div class="ai-direct-title">AI直接生成</div>
                    <div class="ai-direct-desc">使用大模型直接生成最终信息图表</div>
                </div>
            </div>
        `;

        container.appendChild(aiDirectItem);

        // 将所有图片放入一个数组
        const allImages = [mainImage, ...randomImages].filter(img => img);

        // 创建统一的网格项
        allImages.forEach((imageName, index) => {
            const item = document.createElement('div');
            item.className = 'reference-item';
            item.setAttribute('data-filename', imageName);

            item.innerHTML = `
                <div class="reference-image-container">
                    <img class="reference-image" src="/infographics/${imageName}" alt="参考图${index + 1}">
                </div>
            `;

            container.appendChild(item);
        });

        // 添加点击事件
        setupReferenceSelection();

        // 显示或隐藏"加载更多"按钮
        const loadMoreBtn = document.getElementById('loadMoreReferencesBtn');
        if (hasMore) {
            loadMoreBtn.style.display = 'inline-block';
        } else {
            loadMoreBtn.style.display = 'none';
        }

        // 显示参考图卡片
        const referenceCard = document.getElementById('referenceCard');
        referenceCard.classList.remove('hidden');
        referenceCard.classList.add('fade-in');
        referenceCard.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('获取参考图失败:', error);
        alert('获取参考图失败，请重试');
    }
}

// 设置参考图选择
function setupReferenceSelection() {
    const referenceItems = document.querySelectorAll('.reference-item');
    const selectBtn = document.getElementById('selectReferenceBtn');

    referenceItems.forEach(item => {
        item.addEventListener('click', function() {
            // 移除所有选中状态
            referenceItems.forEach(ref => ref.classList.remove('selected'));

            // 检查选择是否改变
            if (selectedReference != this.getAttribute('data-filename') && selectedReference) {
                hideCards(["titleCard", "pictogramCard", "resultCard"]);
            }

            // 添加选中状态
            this.classList.add('selected');

            // 判断是否选择了AI直接生成
            if (this.getAttribute('data-ai-direct') === 'true') {
                selectedReference = 'ai_direct';
                selectBtn.textContent = '🤖 AI直接生成信息图表';
            } else {
                selectedReference = this.getAttribute('data-filename');
                selectBtn.textContent = '✨ 选择此参考图表';
            }

            selectBtn.disabled = false;
        });
    });
}

// 选择参考图表并开始标题生成
async function selectReferenceAndStartTitleGeneration() {
    if (!selectedReference) {
        alert('请先选择一个参考图表');
        return;
    }

    // 如果选择了AI直接生成
    if (selectedReference === 'ai_direct') {
        await directGenerateWithAI();
        return;
    }

    // 显示加载overlay
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = '抽取参考图表风格...';
    document.getElementById('selectReferenceBtn').disabled = true;

    try {
        // 调用 API 抽取参考图风格（颜色等）
        const response = await fetch(`/api/start_layout_extraction/${selectedReference}/${currentDataFile}`);
        const result = await response.json();

        if (result.status === 'started') {
            // 等待风格抽取完成后开始标题生成
            checkStatusForTitleGeneration();
        }

    } catch (error) {
        console.error('风格抽取失败:', error);
        alert('风格抽取失败，请重试');
        hideLoading();
    }
}

// 检查状态并在布局抽取完成后开始标题生成
async function checkStatusForTitleGeneration() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        if (status.step === 'layout_extraction' && status.completed) {
            // 风格抽取完成，开始标题生成
            hideLoading();
            startTitleGeneration();
        } else if (status.status === 'processing') {
            // 继续轮询
            document.getElementById('loadingText').textContent = status.progress || '处理中...';
            setTimeout(checkStatusForTitleGeneration, 500);
        } else if (status.status === 'error') {
            alert('处理失败: ' + status.progress);
            hideLoading();
        } else {
            setTimeout(checkStatusForTitleGeneration, 500);
        }
    } catch (error) {
        console.error('状态检查失败:', error);
        hideLoading();
    }
}

// 加载更多参考图表
async function loadMoreReferences() {
    const loadMoreBtn = document.getElementById('loadMoreReferencesBtn');
    loadMoreBtn.disabled = true;

    try {
        const response = await fetch('/api/references/next');
        const result = await response.json();

        if (result.status === 'error') {
            alert(result.message);
            return;
        }

        const mainImage = result.main_image;
        const randomImages = result.random_images || [];
        const hasMore = result.has_more || false;

        // 获取容器（不清空，追加内容）
        const container = document.getElementById('referenceContainer');

        // 将所有新图片放入一个数组
        const newImages = [mainImage, ...randomImages].filter(img => img);

        // 追加新的网格项
        newImages.forEach((imageName, index) => {
            const item = document.createElement('div');
            item.className = 'reference-item';
            item.setAttribute('data-filename', imageName);

            item.innerHTML = `
                <div class="reference-image-container">
                    <img class="reference-image" src="/infographics/${imageName}" alt="参考图">
                </div>
            `;

            container.appendChild(item);
        });

        // 重新设置点击事件
        setupReferenceSelection();

        // 更新按钮状态
        loadMoreBtn.disabled = !hasMore;
        if (!hasMore) {
            loadMoreBtn.style.display = 'none';
        }

    } catch (error) {
        console.error('加载更多参考图失败:', error);
        alert('加载更多失败，请重试');
        loadMoreBtn.disabled = false;
    }
}

// AI直接生成信息图表（不需要参考图）
async function directGenerateWithAI() {
    // 显示加载overlay
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = 'AI正在生成信息图表...';
    document.getElementById('selectReferenceBtn').disabled = true;

    try {
        // 调用后端API进行AI直接生成
        const response = await fetch('/api/ai_direct_generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chart_svg: currentChartSVG,
                data_file: currentDataFile
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            // 生成成功，显示结果
            hideLoading();
            displayDirectGenerateResult(result.image_path);
        } else if (result.status === 'started') {
            // 异步处理，开始轮询状态
            checkDirectGenerateStatus();
        } else {
            throw new Error(result.message || 'AI生成失败');
        }

    } catch (error) {
        console.error('AI直接生成失败:', error);
        alert('AI直接生成失败，请重试: ' + error.message);
        hideLoading();
        document.getElementById('selectReferenceBtn').disabled = false;
    }
}

// 检查AI直接生成状态
async function checkDirectGenerateStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        if (status.step === 'ai_direct_generate' && status.completed) {
            // 生成完成
            hideLoading();
            displayDirectGenerateResult(status.result_image);
        } else if (status.status === 'processing') {
            // 继续轮询
            document.getElementById('loadingText').textContent = status.progress || 'AI生成中...';
            setTimeout(checkDirectGenerateStatus, 1000);
        } else if (status.status === 'error') {
            alert('AI生成失败: ' + status.progress);
            hideLoading();
            document.getElementById('selectReferenceBtn').disabled = false;
        } else {
            setTimeout(checkDirectGenerateStatus, 1000);
        }
    } catch (error) {
        console.error('状态检查失败:', error);
        hideLoading();
        document.getElementById('selectReferenceBtn').disabled = false;
    }
}

// 显示AI直接生成的结果
function displayDirectGenerateResult(imagePath) {
    // 隐藏之前的卡片
    hideCards(["titleCard", "pictogramCard"]);

    // 显示结果卡片
    const resultCard = document.getElementById('resultCard');
    const resultImage = document.getElementById('resultImage');

    resultImage.src = '/' + imagePath;

    resultCard.classList.remove('hidden');
    resultCard.classList.add('fade-in');
    resultCard.scrollIntoView({ behavior: 'smooth' });

    // 重新启用选择按钮
    document.getElementById('selectReferenceBtn').disabled = false;
}

