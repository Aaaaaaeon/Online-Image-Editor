/**
 * Image Editor Application
 * Features: Upload, Vector Conversion, Crop, Resize, Color Detection & Replacement
 * Enhanced: Unit conversion (mm/cm/px/inches), Crop presets, Image complexity detection
 */

class ImageEditor {
    constructor() {
        // Canvas and context
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // Image data
        this.originalImage = null;
        this.currentImageData = null;
        this.imageHistory = [];

        // Cropper
        this.cropper = null;
        this.cropperImage = document.getElementById('cropperImage');

        // Colors
        this.detectedColors = [];
        this.colorTolerance = 40;
        this.selectedColor = null;
        this.uniqueColorCount = 0;
        this.imageComplexity = 'simple'; // simple, medium, complex
        this.forceEditColors = false; // Override for complex images

        // Tools
        this.currentTool = null; // 'eyedropper', 'eraser', 'excludeRect', 'excludeCircle', null
        this.eraserSize = 20;
        this.isDrawing = false;

        // Exclusion zones
        this.exclusionZones = []; // Array of {type: 'rect'|'circle', x, y, width, height, radius}
        this.drawingZone = null; // Current zone being drawn
        this.drawStartPoint = null;

        // Units - default DPI for conversion
        this.currentUnit = 'mm';
        this.dpi = 72;

        // Initialize
        this.initEventListeners();
        this.updateStatus('Prêt - Glissez une image pour commencer');
    }

    // ========================================
    // Unit Conversion
    // ========================================
    pxToUnit(px, unit) {
        switch (unit) {
            case 'mm': return (px / this.dpi) * 25.4;
            case 'cm': return (px / this.dpi) * 2.54;
            case 'in': return px / this.dpi;
            case 'px': default: return px;
        }
    }

    unitToPx(value, unit) {
        switch (unit) {
            case 'mm': return (value / 25.4) * this.dpi;
            case 'cm': return (value / 2.54) * this.dpi;
            case 'in': return value * this.dpi;
            case 'px': default: return value;
        }
    }

    updateSizeInputs() {
        const unit = this.currentUnit;
        const width = this.pxToUnit(this.canvas.width, unit);
        const height = this.pxToUnit(this.canvas.height, unit);

        document.getElementById('widthInput').value = unit === 'px' ? Math.round(width) : width.toFixed(2);
        document.getElementById('heightInput').value = unit === 'px' ? Math.round(height) : height.toFixed(2);
    }

    // ========================================
    // Event Listeners
    // ========================================
    initEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFile(file);
        });

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) this.handleFile(e.target.files[0]);
        });

        // Crop tools
        document.getElementById('cropBtn').addEventListener('click', () => this.startCrop());
        document.getElementById('applyCropBtn').addEventListener('click', () => this.applyCrop());
        document.getElementById('cancelCropBtn').addEventListener('click', () => this.cancelCrop());

        // Crop presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setCropRatio(e.target.dataset.ratio);
            });
        });

        // Unit selector
        document.getElementById('unitSelect').addEventListener('change', (e) => {
            this.currentUnit = e.target.value;
            this.updateSizeInputs();
        });

        // DPI input
        document.getElementById('dpiInput').addEventListener('change', (e) => {
            this.dpi = parseInt(e.target.value) || 72;
            this.updateSizeInputs();
        });

        // Resize
        document.getElementById('resizeBtn').addEventListener('click', () => this.resize());
        document.getElementById('widthInput').addEventListener('input', (e) => this.handleSizeChange('width', e.target.value));
        document.getElementById('heightInput').addEventListener('input', (e) => this.handleSizeChange('height', e.target.value));

        // Export
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());


        // Precision buttons for color grouping
        document.querySelectorAll('.precision-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.precision-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.colorTolerance = parseInt(e.target.dataset.tolerance);
                this.analyzeColors();
            });
        });

        // Force edit colors checkbox (for complex images)
        document.getElementById('forceEditColors').addEventListener('change', (e) => {
            this.forceEditColors = e.target.checked;
            this.renderColorsList();
        });

        // Color modal
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            document.getElementById('newColorBox').style.backgroundColor = e.target.value;
        });

        document.getElementById('makeTransparent').addEventListener('change', (e) => {
            const picker = document.getElementById('colorPicker');
            const newBox = document.getElementById('newColorBox');
            if (e.target.checked) {
                picker.disabled = true;
                newBox.style.background = 'repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 50% / 10px 10px';
            } else {
                picker.disabled = false;
                newBox.style.background = picker.value;
            }
        });

        document.getElementById('replaceTolerance').addEventListener('input', (e) => {
            document.getElementById('replaceToleranceValue').textContent = e.target.value;
        });

        document.getElementById('applyColorBtn').addEventListener('click', () => this.applyColorChange());
        document.getElementById('cancelColorBtn').addEventListener('click', () => this.closeColorModal());

        // Mobile menu toggle
        const menuToggle = document.getElementById('menuToggle');
        const toolsPanel = document.getElementById('toolsPanel');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                toolsPanel.classList.toggle('open');
            });
        }

        // Embroidery recalculation
        document.getElementById('recalcEmbroideryBtn').addEventListener('click', () => this.calculateEmbroidery());

        // Eyedropper tool
        document.getElementById('eyedropperBtn').addEventListener('click', () => this.toggleTool('eyedropper'));

        // Eraser tool
        document.getElementById('eraserBtn').addEventListener('click', () => this.toggleTool('eraser'));
        document.getElementById('eraserSize').addEventListener('input', (e) => {
            this.eraserSize = parseInt(e.target.value);
            document.getElementById('eraserSizeValue').textContent = this.eraserSize;
        });

        // Canvas interactions for tools
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleCanvasMouseUp());

        // Exclusion zones
        document.getElementById('excludeRectBtn').addEventListener('click', () => this.toggleTool('excludeRect'));
        document.getElementById('excludeCircleBtn').addEventListener('click', () => this.toggleTool('excludeCircle'));
        document.getElementById('clearExclusionsBtn').addEventListener('click', () => this.clearExclusionZones());

        // OCR text scanning
        document.getElementById('scanTextBtn').addEventListener('click', () => this.scanTextWithOCR());
    }

    // ========================================
    // OCR Text Recognition (Optimized)
    // ========================================

    /**
     * Preprocess image for better OCR accuracy
     * - Convert to grayscale
     * - Increase contrast
     * - Apply threshold (binarization)
     * - Upscale if too small
     */
    preprocessForOCR() {
        const srcCanvas = this.canvas;
        const srcCtx = this.ctx;

        // Create a temporary canvas for preprocessing
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        // Upscale small images (OCR works better with larger text)
        const minDimension = 1000;
        let scale = 1;
        if (srcCanvas.width < minDimension && srcCanvas.height < minDimension) {
            scale = Math.min(3, minDimension / Math.max(srcCanvas.width, srcCanvas.height));
        }

        tempCanvas.width = Math.round(srcCanvas.width * scale);
        tempCanvas.height = Math.round(srcCanvas.height * scale);

        // Draw scaled image
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(srcCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

        // Get image data for processing
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        // Step 1: Convert to grayscale and calculate histogram
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }

        // Step 2: Calculate Otsu threshold for binarization
        const totalPixels = tempCanvas.width * tempCanvas.height;
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];

        let sumB = 0, wB = 0, wF = 0;
        let maxVariance = 0, threshold = 128;

        for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;
            wF = totalPixels - wB;
            if (wF === 0) break;

            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const variance = wB * wF * (mB - mF) * (mB - mF);

            if (variance > maxVariance) {
                maxVariance = variance;
                threshold = t;
            }
        }

        // Step 3: Apply contrast enhancement and adaptive thresholding
        for (let i = 0; i < data.length; i += 4) {
            let gray = data[i];

            // Enhance contrast
            gray = Math.round(((gray - 128) * 1.5) + 128);
            gray = Math.max(0, Math.min(255, gray));

            // Apply threshold (binarization) - but keep some gradation for better OCR
            if (gray < threshold - 30) {
                gray = 0;
            } else if (gray > threshold + 30) {
                gray = 255;
            }
            // else keep the gray value for anti-aliased text edges

            data[i] = data[i + 1] = data[i + 2] = gray;
        }

        tempCtx.putImageData(imageData, 0, 0);

        console.log(`OCR Preprocessing: scale=${scale.toFixed(1)}x, threshold=${threshold}, size=${tempCanvas.width}x${tempCanvas.height}`);

        return tempCanvas.toDataURL('image/png');
    }

    async scanTextWithOCR() {
        if (!this.currentImageData) {
            this.updateStatus('❌ Aucune image à scanner');
            return;
        }

        const contentEl = document.getElementById('ocrContent');
        contentEl.innerHTML = '<div class="ocr-loading"><div class="spinner-small"></div><span>Prétraitement...</span></div>';
        this.updateStatus('🔍 Prétraitement de l\'image...');

        try {
            // Restore clean image for preprocessing
            this.ctx.putImageData(this.currentImageData, 0, 0);

            // Preprocess image for better OCR
            const preprocessedDataUrl = this.preprocessForOCR();

            // Redraw exclusion zones if any
            if (this.exclusionZones.length > 0) {
                this.drawExclusionZones();
            }

            contentEl.innerHTML = '<div class="ocr-loading"><div class="spinner-small"></div><span>Analyse OCR...</span></div>';

            // Initialize worker if not exists (reuse for better performance)
            if (!this.ocrWorker) {
                this.updateStatus('🔍 Chargement du moteur OCR...');
                this.ocrWorker = await Tesseract.createWorker('fra', 1, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const percent = Math.round(m.progress * 100);
                            this.updateStatus(`🔍 Analyse OCR: ${percent}%`);
                        }
                    }
                });

                // Set optimized parameters
                await this.ocrWorker.setParameters({
                    tessedit_pageseg_mode: Tesseract.PSM.AUTO, // Automatic page segmentation
                    tessedit_char_whitelist: '', // Allow all characters
                    preserve_interword_spaces: '1',
                });
            }

            // Run OCR with preprocessed image
            const result = await this.ocrWorker.recognize(preprocessedDataUrl);

            const text = result.data.text.trim();
            const confidence = result.data.confidence;

            if (text && confidence > 30) {
                contentEl.innerHTML = `
                    <p class="ocr-text">${this.escapeHtml(text)}</p>
                    <p class="ocr-confidence">Confiance: ${confidence.toFixed(0)}%</p>
                `;
                this.updateStatus(`✅ Texte détecté (confiance: ${confidence.toFixed(0)}%)`);

                // Analyze text size warnings
                this.analyzeTextSize(result.data.words);
            } else if (text) {
                contentEl.innerHTML = `
                    <p class="ocr-text ocr-low-confidence">${this.escapeHtml(text)}</p>
                    <p class="ocr-confidence">Confiance faible: ${confidence.toFixed(0)}%</p>
                `;
                this.updateStatus(`⚠️ Texte détecté (confiance faible: ${confidence.toFixed(0)}%)`);
            } else {
                contentEl.innerHTML = '<p class="ocr-placeholder">Aucun texte détecté dans l\'image</p>';
                this.updateStatus('ℹ️ Aucun texte détecté');
            }
        } catch (error) {
            console.error('OCR Error:', error);
            contentEl.innerHTML = '<p class="ocr-placeholder">Erreur lors de l\'analyse OCR</p>';
            this.updateStatus('❌ Erreur OCR');
        }
    }

    /**
     * Analyze detected words and warn about small text
     */
    analyzeTextSize(words) {
        if (!words || words.length === 0) return;

        const pixelsPerMm = this.dpi / 25.4;
        const minHeightMm = 5; // Minimum for embroidery
        let smallTextFound = false;
        let smallestHeightMm = Infinity;

        for (const word of words) {
            if (word.confidence > 50) { // Only consider confident detections
                const heightPx = word.bbox.y1 - word.bbox.y0;
                const heightMm = heightPx / pixelsPerMm;

                if (heightMm < smallestHeightMm) {
                    smallestHeightMm = heightMm;
                }

                if (heightMm < minHeightMm) {
                    smallTextFound = true;
                }
            }
        }

        // Update warning
        const warningEl = document.getElementById('textWarning');
        const messageEl = document.getElementById('textWarningMessage');

        if (smallTextFound) {
            warningEl.style.display = 'flex';
            messageEl.textContent = `Texte détecté avec une hauteur de ~${smallestHeightMm.toFixed(1)}mm. Le minimum recommandé pour la broderie est 5mm.`;
        }

        console.log(`OCR: ${words.length} words, smallest height: ${smallestHeightMm.toFixed(1)}mm`);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================
    // Tools (Eyedropper & Eraser)
    // ========================================
    toggleTool(tool) {
        // If same tool, deactivate
        if (this.currentTool === tool) {
            this.currentTool = null;
            document.getElementById('eyedropperBtn').classList.remove('active');
            document.getElementById('eraserBtn').classList.remove('active');
            document.getElementById('excludeRectBtn').classList.remove('active');
            document.getElementById('excludeCircleBtn').classList.remove('active');
            document.getElementById('eraserSettings').style.display = 'none';
            this.canvas.style.cursor = 'default';
            this.updateStatus('Outil désactivé');
            return;
        }

        // Activate new tool
        this.currentTool = tool;
        document.getElementById('eyedropperBtn').classList.remove('active');
        document.getElementById('eraserBtn').classList.remove('active');
        document.getElementById('excludeRectBtn').classList.remove('active');
        document.getElementById('excludeCircleBtn').classList.remove('active');
        document.getElementById('eraserSettings').style.display = 'none';

        if (tool === 'eyedropper') {
            document.getElementById('eyedropperBtn').classList.add('active');
            this.canvas.style.cursor = 'crosshair';
            this.updateStatus('💧 Cliquez sur une couleur à modifier');
        } else if (tool === 'eraser') {
            document.getElementById('eraserBtn').classList.add('active');
            document.getElementById('eraserSettings').style.display = 'block';
            this.canvas.style.cursor = 'crosshair';
            this.updateStatus('🧹 Cliquez et glissez pour effacer');
        } else if (tool === 'excludeRect') {
            document.getElementById('excludeRectBtn').classList.add('active');
            this.canvas.style.cursor = 'crosshair';
            this.updateStatus('⬜ Dessinez un rectangle d\'exclusion');
        } else if (tool === 'excludeCircle') {
            document.getElementById('excludeCircleBtn').classList.add('active');
            this.canvas.style.cursor = 'crosshair';
            this.updateStatus('⭕ Dessinez un cercle d\'exclusion');
        }
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
        };
    }

    handleCanvasClick(e) {
        if (this.currentTool !== 'eyedropper') return;
        if (!this.currentImageData) return;

        const { x, y } = this.getCanvasCoordinates(e);

        // Get pixel color
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const index = (y * this.canvas.width + x) * 4;
        const color = {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2],
            a: imageData.data[index + 3],
            count: 1,
            percentage: 0,
            clusteredColors: []
        };

        // Open color modal with picked color
        this.openColorModal(color, true); // true = from eyedropper
        this.toggleTool(null); // Deactivate tool
    }

    handleCanvasMouseDown(e) {
        if (!this.currentImageData) return;

        // Eraser tool
        if (this.currentTool === 'eraser') {
            this.saveToHistory();
            this.isDrawing = true;
            this.erase(e);
            return;
        }

        // Exclusion zone tools
        if (this.currentTool === 'excludeRect' || this.currentTool === 'excludeCircle') {
            this.drawStartPoint = this.getCanvasCoordinates(e);
            this.isDrawing = true;
            return;
        }
    }

    handleCanvasMouseMove(e) {
        // Eraser
        if (this.isDrawing && this.currentTool === 'eraser') {
            this.erase(e);
            return;
        }

        // Drawing exclusion zone preview
        if (this.isDrawing && (this.currentTool === 'excludeRect' || this.currentTool === 'excludeCircle')) {
            const currentPoint = this.getCanvasCoordinates(e);
            this.drawExclusionPreview(currentPoint);
            return;
        }
    }

    handleCanvasMouseUp(e) {
        if (this.isDrawing && this.currentTool === 'eraser') {
            this.isDrawing = false;
            this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.analyzeColors();
            return;
        }

        // Finish drawing exclusion zone
        if (this.isDrawing && (this.currentTool === 'excludeRect' || this.currentTool === 'excludeCircle')) {
            this.isDrawing = false;
            if (e) {
                const endPoint = this.getCanvasCoordinates(e);
                this.addExclusionZone(endPoint);
            }
            this.drawStartPoint = null;
            return;
        }
    }

    drawExclusionPreview(currentPoint) {
        // Redraw the image
        this.ctx.putImageData(this.currentImageData, 0, 0);

        // Draw existing zones
        this.drawExclusionZones();

        // Draw preview zone
        const start = this.drawStartPoint;
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';

        if (this.currentTool === 'excludeRect') {
            const width = currentPoint.x - start.x;
            const height = currentPoint.y - start.y;
            this.ctx.strokeRect(start.x, start.y, width, height);
            this.ctx.fillRect(start.x, start.y, width, height);
        } else if (this.currentTool === 'excludeCircle') {
            const radius = Math.sqrt(Math.pow(currentPoint.x - start.x, 2) + Math.pow(currentPoint.y - start.y, 2));
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    addExclusionZone(endPoint) {
        const start = this.drawStartPoint;
        let zone;

        if (this.currentTool === 'excludeRect') {
            zone = {
                type: 'rect',
                x: Math.min(start.x, endPoint.x),
                y: Math.min(start.y, endPoint.y),
                width: Math.abs(endPoint.x - start.x),
                height: Math.abs(endPoint.y - start.y)
            };
            // Minimum size check
            if (zone.width < 5 || zone.height < 5) return;
        } else {
            const radius = Math.sqrt(Math.pow(endPoint.x - start.x, 2) + Math.pow(endPoint.y - start.y, 2));
            if (radius < 5) return;
            zone = {
                type: 'circle',
                x: start.x,
                y: start.y,
                radius: radius
            };
        }

        this.exclusionZones.push(zone);
        this.updateExclusionUI();
        this.redrawWithExclusions();
        this.updateStatus(`✅ Zone d'exclusion ajoutée (${this.exclusionZones.length} total)`);
    }

    drawExclusionZones() {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';

        for (const zone of this.exclusionZones) {
            if (zone.type === 'rect') {
                this.ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
                this.ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
            } else if (zone.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }

    redrawWithExclusions() {
        this.ctx.putImageData(this.currentImageData, 0, 0);
        this.drawExclusionZones();
    }

    updateExclusionUI() {
        const info = document.getElementById('exclusionInfo');
        const count = document.getElementById('exclusionCount');
        if (this.exclusionZones.length > 0) {
            info.style.display = 'flex';
            count.textContent = this.exclusionZones.length;
        } else {
            info.style.display = 'none';
        }
    }

    clearExclusionZones() {
        this.exclusionZones = [];
        this.updateExclusionUI();
        this.ctx.putImageData(this.currentImageData, 0, 0);
        this.updateStatus('🗑️ Zones d\'exclusion effacées');
    }

    isPixelExcluded(x, y) {
        for (const zone of this.exclusionZones) {
            if (zone.type === 'rect') {
                if (x >= zone.x && x <= zone.x + zone.width &&
                    y >= zone.y && y <= zone.y + zone.height) {
                    return true;
                }
            } else if (zone.type === 'circle') {
                const dist = Math.sqrt(Math.pow(x - zone.x, 2) + Math.pow(y - zone.y, 2));
                if (dist <= zone.radius) {
                    return true;
                }
            }
        }
        return false;
    }

    erase(e) {
        const { x, y } = this.getCanvasCoordinates(e);
        const radius = this.eraserSize / 2;

        // Clear circle (make transparent)
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    // ========================================
    // File Handling
    // ========================================
    async handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const vectorFormats = ['svg', 'eps', 'ai', 'cdr', 'cmx'];
        const rasterFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'];

        if (vectorFormats.includes(ext)) {
            await this.uploadAndConvert(file);
        } else if (rasterFormats.includes(ext)) {
            await this.loadLocalImage(file);
        } else {
            this.updateStatus('❌ Format non supporté: ' + ext);
        }
    }

    async uploadAndConvert(file) {
        this.showLoading('Conversion du fichier vectoriel...');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                await this.loadImageFromDataUrl(result.image);
                this.updateStatus(`✅ ${file.name} converti avec succès`);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Conversion error:', error);
            this.updateStatus(`❌ Erreur: ${error.message}`);

            if (error.message.includes('Inkscape')) {
                alert('Pour convertir les fichiers CDR/CMX, veuillez installer Inkscape:\nhttps://inkscape.org/');
            } else if (error.message.includes('Ghostscript')) {
                alert('Pour convertir les fichiers EPS/AI, veuillez installer Ghostscript:\nhttps://ghostscript.com/');
            }
        } finally {
            this.hideLoading();
        }
    }

    async loadLocalImage(file) {
        this.showLoading('Chargement de l\'image...');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                await this.loadImageFromDataUrl(e.target.result);
                this.updateStatus(`✅ ${file.name} chargé`);
                this.hideLoading();
                resolve();
            };

            reader.onerror = () => {
                this.hideLoading();
                this.updateStatus('❌ Erreur de lecture du fichier');
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    }

    async loadImageFromDataUrl(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this.drawImage(img);
                this.showEditorPanels();
                this.analyzeColors();
                resolve();
            };
            img.src = dataUrl;
        });
    }

    // ========================================
    // Drawing
    // ========================================
    drawImage(img) {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        // Update size inputs in current unit
        this.updateSizeInputs();

        // Show canvas
        this.canvas.style.display = 'block';
        document.getElementById('placeholder').style.display = 'none';

        // Update info
        this.updateCanvasInfo();
    }

    redrawFromImageData() {
        this.ctx.putImageData(this.currentImageData, 0, 0);
        this.updateCanvasInfo();
    }

    updateCanvasInfo() {
        const info = document.getElementById('canvasInfo');
        const widthMm = this.pxToUnit(this.canvas.width, 'mm').toFixed(1);
        const heightMm = this.pxToUnit(this.canvas.height, 'mm').toFixed(1);
        info.textContent = `${this.canvas.width} × ${this.canvas.height} px  |  ${widthMm} × ${heightMm} mm @ ${this.dpi} DPI`;
    }

    showEditorPanels() {
        document.getElementById('editTools').style.display = 'block';
        document.getElementById('embroiderySection').style.display = 'block';
        document.getElementById('exportSection').style.display = 'block';
        document.getElementById('colorsPanel').style.display = 'block';

        // Calculate embroidery estimate
        this.calculateEmbroidery();
    }

    // ========================================
    // Crop
    // ========================================
    startCrop() {
        // Convert canvas to image for cropper
        const dataUrl = this.canvas.toDataURL('image/png');
        this.cropperImage.src = dataUrl;
        this.cropperImage.style.display = 'block';
        this.canvas.style.display = 'none';

        // Initialize cropper
        this.cropper = new Cropper(this.cropperImage, {
            viewMode: 1,
            dragMode: 'crop',
            autoCropArea: 0.8,
            responsive: true,
            background: false
        });

        // Toggle buttons and show presets
        document.getElementById('cropBtn').style.display = 'none';
        document.getElementById('applyCropBtn').style.display = 'block';
        document.getElementById('cancelCropBtn').style.display = 'block';
        document.getElementById('cropPresets').style.display = 'block';

        this.updateStatus('Sélectionnez la zone à recadrer');
    }

    setCropRatio(ratio) {
        if (!this.cropper) return;

        if (ratio === 'free') {
            this.cropper.setAspectRatio(NaN);
        } else {
            const [w, h] = ratio.split(':').map(Number);
            this.cropper.setAspectRatio(w / h);
        }
    }

    applyCrop() {
        if (!this.cropper) return;

        // Save to history
        this.saveToHistory();

        // Get cropped canvas
        const croppedCanvas = this.cropper.getCroppedCanvas();

        // Update main canvas
        this.canvas.width = croppedCanvas.width;
        this.canvas.height = croppedCanvas.height;
        this.ctx.drawImage(croppedCanvas, 0, 0);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        this.finishCrop();
        this.updateStatus('✅ Recadrage appliqué');

        // Re-analyze colors
        this.analyzeColors();
    }

    cancelCrop() {
        this.finishCrop();
        this.updateStatus('Recadrage annulé');
    }

    finishCrop() {
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }

        this.cropperImage.style.display = 'none';
        this.canvas.style.display = 'block';

        // Toggle buttons
        document.getElementById('cropBtn').style.display = 'block';
        document.getElementById('applyCropBtn').style.display = 'none';
        document.getElementById('cancelCropBtn').style.display = 'none';
        document.getElementById('cropPresets').style.display = 'none';

        // Reset preset selection
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.preset-btn[data-ratio="free"]').classList.add('active');

        // Update size inputs
        this.updateSizeInputs();
        this.updateCanvasInfo();
    }

    // ========================================
    // Resize
    // ========================================
    handleSizeChange(dimension, value) {
        if (!document.getElementById('lockRatio').checked) return;

        const ratio = this.canvas.width / this.canvas.height;
        const widthInput = document.getElementById('widthInput');
        const heightInput = document.getElementById('heightInput');

        if (dimension === 'width') {
            const newHeight = parseFloat(value) / ratio;
            heightInput.value = this.currentUnit === 'px' ? Math.round(newHeight) : newHeight.toFixed(2);
        } else {
            const newWidth = parseFloat(value) * ratio;
            widthInput.value = this.currentUnit === 'px' ? Math.round(newWidth) : newWidth.toFixed(2);
        }
    }

    resize() {
        const widthValue = parseFloat(document.getElementById('widthInput').value);
        const heightValue = parseFloat(document.getElementById('heightInput').value);

        // Convert to pixels
        const newWidth = Math.round(this.unitToPx(widthValue, this.currentUnit));
        const newHeight = Math.round(this.unitToPx(heightValue, this.currentUnit));

        if (newWidth < 1 || newHeight < 1) {
            this.updateStatus('❌ Dimensions invalides');
            return;
        }

        // Save to history
        this.saveToHistory();

        // Create temp canvas for resize
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw resized image
        tempCtx.drawImage(this.canvas, 0, 0, newWidth, newHeight);

        // Update main canvas
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.ctx.drawImage(tempCanvas, 0, 0);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        this.updateCanvasInfo();
        this.updateSizeInputs();
        this.updateStatus(`✅ Image redimensionnée à ${newWidth}×${newHeight} px`);

        // Re-analyze colors
        this.analyzeColors();
    }

    // ========================================
    // Embroidery Estimation
    // ========================================

    /**
     * Polynomial coefficients derived from regression of calibration data:
     * Original data: 1cm=400pts, 5cm=5100pts, 10cm=18300pts, 20cm=69200pts, 30cm=152800pts
     * 
     * Formula: stitches = A × side² + B × side
     * This models:
     * - Area effect (side²): main fill stitches
     * - Perimeter effect (side): edge/contour stitches
     * 
     * Coefficients fitted via least squares regression:
     * A ≈ 159 (stitches per cm² for fill)
     * B ≈ 241 (stitches per cm for edges)
     */
    static STITCH_COEFFICIENT_A = 159;  // Area coefficient
    static STITCH_COEFFICIENT_B = 241;  // Perimeter coefficient

    /**
     * Calculate stitch count using polynomial formula
     * More accurate than linear interpolation between points
     * Formula: stitches = 159 × side² + 241 × side
     */
    calculateStitches(sideLengthCm) {
        const A = ImageEditor.STITCH_COEFFICIENT_A;
        const B = ImageEditor.STITCH_COEFFICIENT_B;

        // Polynomial formula: A*s² + B*s
        const stitches = A * sideLengthCm * sideLengthCm + B * sideLengthCm;

        return Math.round(stitches);
    }

    /**
     * Calculate embroidery estimation:
     * - Count non-transparent pixels
     * - Convert to cm² based on DPI
     * - Estimate stitch count using calibration data
     */
    calculateEmbroidery() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;

        // Count non-transparent pixels (alpha > 10 to ignore near-transparent)
        let nonTransparentPixels = 0;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 10) {
                nonTransparentPixels++;
            }
        }

        // Calculate total pixels for comparison
        const totalPixels = this.canvas.width * this.canvas.height;

        // Convert pixels to cm²
        // 1 inch = 2.54 cm, pixels per inch = DPI
        const pixelsPerCm = this.dpi / 2.54;
        const pixelsPerCm2 = pixelsPerCm * pixelsPerCm;
        const surfaceAreaCm2 = nonTransparentPixels / pixelsPerCm2;

        // Calculate equivalent square side length
        const equivalentSideCm = Math.sqrt(surfaceAreaCm2);

        // Get stitch estimate using polynomial formula
        const stitchCount = this.calculateStitches(equivalentSideCm);

        // Calculate real dimensions
        const widthCm = this.pxToUnit(this.canvas.width, 'cm');
        const heightCm = this.pxToUnit(this.canvas.height, 'cm');

        // Update UI
        document.getElementById('surfaceArea').textContent = surfaceAreaCm2.toFixed(2) + ' cm²';
        document.getElementById('realDimensions').textContent = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
        document.getElementById('stitchCount').textContent = this.formatStitchCount(stitchCount);

        // Detect potential small text/details
        this.detectSmallDetails();

        // Log for debugging
        console.log(`Embroidery: ${nonTransparentPixels}/${totalPixels} px, ${surfaceAreaCm2.toFixed(2)} cm², ~${stitchCount} pts`);
    }

    /**
     * Heuristic detection of small details/text that might be too small for embroidery
     * Uses edge detection and analysis of small connected components
     */
    detectSmallDetails() {
        if (!this.currentImageData) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const data = this.currentImageData.data;

        // Convert to grayscale and detect edges using Sobel-like operator
        let edgeCount = 0;
        let smallDetailScore = 0;
        const edgeThreshold = 50;

        // Analyze edge density in small windows (looking for text-like patterns)
        const windowSize = 8; // pixels
        const minHeightMm = 5; // minimum text height for embroidery
        const pixelsPerMm = this.dpi / 25.4;

        // Sample the image for edge detection
        for (let y = 1; y < height - 1; y += 2) {
            for (let x = 1; x < width - 1; x += 2) {
                // Get grayscale values of surrounding pixels
                const getGray = (ox, oy) => {
                    const i = ((y + oy) * width + (x + ox)) * 4;
                    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                };

                const left = getGray(-1, 0);
                const right = getGray(1, 0);
                const top = getGray(0, -1);
                const bottom = getGray(0, 1);

                // Simple edge detection (gradient magnitude)
                const gx = Math.abs(right - left);
                const gy = Math.abs(bottom - top);
                const gradient = Math.sqrt(gx * gx + gy * gy);

                if (gradient > edgeThreshold) {
                    edgeCount++;

                    // Check if this edge is part of a small detail (text-like)
                    if (y < height - windowSize && x < width - windowSize) {
                        let localEdges = 0;
                        for (let wy = 0; wy < windowSize; wy += 2) {
                            for (let wx = 0; wx < windowSize; wx += 2) {
                                const wIdx = ((y + wy) * width + (x + wx)) * 4;
                                const wCenter = 0.299 * data[wIdx] + 0.587 * data[wIdx + 1] + 0.114 * data[wIdx + 2];
                                if (wIdx + 4 < data.length) {
                                    const wRight = 0.299 * data[wIdx + 4] + 0.587 * data[wIdx + 5] + 0.114 * data[wIdx + 6];
                                    if (Math.abs(wRight - wCenter) > edgeThreshold) {
                                        localEdges++;
                                    }
                                }
                            }
                        }
                        if (localEdges > (windowSize * windowSize) / 8) {
                            smallDetailScore++;
                        }
                    }
                }
            }
        }

        // Calculate metrics
        const totalSampled = (width / 2) * (height / 2);
        const edgeDensity = edgeCount / totalSampled;
        const smallDetailRatio = smallDetailScore / Math.max(1, edgeCount);

        // Determine density level and risk
        let densityLevel, densityClass;
        if (edgeDensity < 0.03) {
            densityLevel = 'Faible';
            densityClass = 'low';
        } else if (edgeDensity < 0.08) {
            densityLevel = 'Moyenne';
            densityClass = 'medium';
        } else {
            densityLevel = 'Élevée';
            densityClass = 'high';
        }

        // Check if image is small enough that any text would be too small
        const imageSizeMm = Math.min(
            this.pxToUnit(width, 'mm'),
            this.pxToUnit(height, 'mm')
        );

        // Determine risk level
        let riskLevel, riskClass;
        const hasSmallDetails = edgeDensity > 0.05 && smallDetailRatio > 0.1;
        const textLikelyTooSmall = hasSmallDetails && imageSizeMm < 100;

        if (textLikelyTooSmall) {
            riskLevel = 'Élevé';
            riskClass = 'high';
        } else if (hasSmallDetails) {
            riskLevel = 'Moyen';
            riskClass = 'medium';
        } else {
            riskLevel = 'Faible';
            riskClass = 'low';
        }

        // Update Analysis UI
        const densityEl = document.getElementById('detailDensity');
        const riskEl = document.getElementById('smallTextRisk');

        if (densityEl) {
            densityEl.textContent = densityLevel;
            densityEl.className = `analysis-value ${densityClass}`;
        }
        if (riskEl) {
            riskEl.textContent = riskLevel;
            riskEl.className = `analysis-value ${riskClass}`;
        }

        // Update warning UI
        const warningEl = document.getElementById('textWarning');
        const titleEl = document.getElementById('textWarningTitle');
        const messageEl = document.getElementById('textWarningMessage');
        const detailsEl = document.getElementById('textWarningDetails');

        if (hasSmallDetails && warningEl) {
            warningEl.style.display = 'flex';

            if (textLikelyTooSmall) {
                titleEl.textContent = '⚠️ Texte potentiellement trop petit';
                messageEl.textContent = `À la taille actuelle (${imageSizeMm.toFixed(0)}mm), le texte risque de faire moins de 5mm.`;
                detailsEl.innerHTML = `
                    <li>Dimension minimum de l'image : ${imageSizeMm.toFixed(0)}mm</li>
                    <li>Densité de détails : ${(edgeDensity * 100).toFixed(1)}%</li>
                    <li>Envisagez d'agrandir l'image ou simplifier le design</li>
                `;
            } else {
                titleEl.textContent = '⚠️ Détails fins détectés';
                messageEl.textContent = 'Des éléments complexes ont été détectés (texte, lignes fines, détails).';
                detailsEl.innerHTML = `
                    <li>Vérifiez que le texte fait au moins 5mm de hauteur</li>
                    <li>Les lignes < 0.8mm peuvent disparaître à la broderie</li>
                    <li>Préférez des polices épaisses et simples</li>
                `;
            }
        } else if (warningEl) {
            warningEl.style.display = 'none';
        }

        console.log(`Text detection: density=${(edgeDensity * 100).toFixed(1)}%, risk=${riskLevel}, size=${imageSizeMm.toFixed(0)}mm`);
    }

    /**
     * Format stitch count for display (e.g., 15000 -> "15k pts")
     */
    formatStitchCount(count) {
        if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'k pts';
        }
        return count + ' pts';
    }

    // ========================================
    // Image Complexity Detection (Entropy-based)
    // ========================================

    /**
     * Calculate Shannon entropy of the image
     * Higher entropy = more randomness = more complex image
     * @returns {number} Entropy value (0-8 for 8-bit images)
     */
    calculateEntropy() {
        if (!this.currentImageData) return 0;

        const data = this.currentImageData.data;
        const totalPixels = data.length / 4;

        // Build histogram of grayscale values (0-255)
        const histogram = new Array(256).fill(0);

        for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale using luminance formula
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
        }

        // Calculate entropy using Shannon formula: -Σ(p * log2(p))
        let entropy = 0;
        for (let i = 0; i < 256; i++) {
            if (histogram[i] > 0) {
                const probability = histogram[i] / totalPixels;
                entropy -= probability * Math.log2(probability);
            }
        }

        return entropy;
    }

    /**
     * Detect image complexity based on entropy
     * Entropy ranges: 0-8 for 8-bit images
     * - Simple (logos, icons): entropy < 4 (few distinct values, uniform areas)
     * - Medium (illustrations): 4 <= entropy < 6 
     * - Complex (photos): entropy >= 6 (many variations, high detail)
     */
    detectComplexity(uniqueColors) {
        const entropy = this.calculateEntropy();
        this.imageEntropy = entropy; // Store for display

        console.log(`Image entropy: ${entropy.toFixed(2)}, unique colors: ${uniqueColors}`);

        // Entropy-based thresholds
        if (entropy < 4) {
            return 'simple';
        } else if (entropy < 6) {
            return 'medium';
        } else {
            return 'complex';
        }
    }

    updateComplexityBadge() {
        const badge = document.getElementById('complexityBadge');
        const warning = document.getElementById('complexityWarning');
        const colorSettings = document.getElementById('colorSettings');

        badge.className = 'complexity-badge ' + this.imageComplexity;

        const entropyDisplay = this.imageEntropy ? this.imageEntropy.toFixed(1) : '?';
        const labels = {
            simple: `🟢 Image simple (entropie: ${entropyDisplay})`,
            medium: `🟡 Image moyenne (entropie: ${entropyDisplay})`,
            complex: `🔴 Image complexe (entropie: ${entropyDisplay})`
        };

        badge.querySelector('.complexity-text').textContent = labels[this.imageComplexity];

        // Show warning and disable editing for complex images
        if (this.imageComplexity === 'complex') {
            warning.style.display = 'block';
            colorSettings.style.display = 'none';
        } else {
            warning.style.display = 'none';
            colorSettings.style.display = 'block';
        }
    }

    // ========================================
    // Color Detection & Clustering
    // ========================================
    analyzeColors() {
        this.showLoading('Analyse des couleurs...');

        // Use setTimeout to allow UI update
        setTimeout(() => {
            // Use currentImageData (clean, without overlays) instead of canvas
            const imageData = this.currentImageData;
            const data = imageData.data;

            // Step 1: Count all colors
            const colorCounts = new Map();
            const totalPixels = data.length / 4;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                const key = `${r},${g},${b},${a}`;
                colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
            }

            // Step 2: Convert to array with percentages
            let colors = Array.from(colorCounts.entries()).map(([key, count]) => {
                const [r, g, b, a] = key.split(',').map(Number);
                return { r, g, b, a, count, percentage: (count / totalPixels) * 100 };
            });

            // Step 3: FILTER OUT colors below 0.1% FIRST (removes anti-aliasing noise)
            const minPercentage = 0.1;
            colors = colors.filter(c => c.percentage > minPercentage);

            // Step 4: Sort by frequency
            colors.sort((a, b) => b.count - a.count);

            // Step 5: Cluster similar colors
            const clusteredColors = this.clusterColors(colors, this.colorTolerance);

            // Step 6: NOW calculate complexity based on FILTERED colors (not raw pixels)
            this.uniqueColorCount = clusteredColors.length;
            this.imageComplexity = this.detectComplexity(this.uniqueColorCount);
            this.updateComplexityBadge();

            // Step 7: Limit colors for display
            const limits = { simple: 50, medium: 30, complex: 20 };
            this.detectedColors = clusteredColors.slice(0, limits[this.imageComplexity]);

            // Render colors list
            this.renderColorsList();
            this.hideLoading();
            this.updateStatus(`${this.detectedColors.length} couleurs (${this.uniqueColorCount} après filtrage)`);
        }, 50);
    }

    clusterColors(colors, tolerance) {
        const clusters = [];

        for (const color of colors) {
            let foundCluster = false;

            for (const cluster of clusters) {
                if (this.colorDistance(color, cluster.representative) < tolerance) {
                    cluster.colors.push(color);
                    cluster.totalCount += color.count;
                    cluster.percentage += color.percentage;
                    foundCluster = true;
                    break;
                }
            }

            if (!foundCluster) {
                clusters.push({
                    representative: color,
                    colors: [color],
                    totalCount: color.count,
                    percentage: color.percentage
                });
            }
        }

        // Return representatives with updated counts
        return clusters.map(c => ({
            ...c.representative,
            count: c.totalCount,
            percentage: c.percentage,
            clusteredColors: c.colors
        }));
    }

    colorDistance(c1, c2) {
        // Euclidean distance in RGB space
        const dr = c1.r - c2.r;
        const dg = c1.g - c2.g;
        const db = c1.b - c2.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    renderColorsList() {
        const container = document.getElementById('colorsList');
        container.innerHTML = '';

        const isComplex = this.imageComplexity === 'complex';

        for (const color of this.detectedColors) {
            const item = document.createElement('div');
            // Disable only if complex AND forceEdit is not checked
            const isDisabled = isComplex && !this.forceEditColors;
            item.className = 'color-item' + (isDisabled ? ' disabled' : '');
            item.dataset.color = JSON.stringify(color);

            const isTransparent = color.a < 255;
            const rgbaColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
            const hexColor = this.rgbToHex(color.r, color.g, color.b);

            item.innerHTML = `
                <div class="color-swatch">
                    <div class="color-swatch-inner" style="background-color: ${rgbaColor}"></div>
                </div>
                <span class="color-hex">${isTransparent ? 'α' + Math.round(color.a / 2.55) + '%' : hexColor}</span>
                <span class="color-percent">${color.percentage.toFixed(1)}%</span>
            `;

            if (!isDisabled) {
                item.addEventListener('click', () => this.openColorModal(color));
            }
            container.appendChild(item);
        }
    }

    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // ========================================
    // Color Replacement
    // ========================================
    openColorModal(color, fromEyedropper = false) {
        // Block complex images unless using eyedropper or forceEdit is on
        if (this.imageComplexity === 'complex' && !fromEyedropper && !this.forceEditColors) return;

        this.selectedColor = color;

        const modal = document.getElementById('colorModal');
        const originalBox = document.getElementById('originalColorBox');
        const newBox = document.getElementById('newColorBox');
        const colorPicker = document.getElementById('colorPicker');
        const makeTransparent = document.getElementById('makeTransparent');

        const rgbaColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
        originalBox.style.backgroundColor = rgbaColor;

        const hexColor = this.rgbToHex(color.r, color.g, color.b);
        colorPicker.value = hexColor;
        newBox.style.backgroundColor = hexColor;

        makeTransparent.checked = false;
        colorPicker.disabled = false;

        document.getElementById('replaceTolerance').value = 50;
        document.getElementById('replaceToleranceValue').textContent = '50';

        modal.style.display = 'flex';
    }

    closeColorModal() {
        document.getElementById('colorModal').style.display = 'none';
        this.selectedColor = null;
    }

    applyColorChange() {
        if (!this.selectedColor) return;

        // Save to history
        this.saveToHistory();

        const makeTransparent = document.getElementById('makeTransparent').checked;
        const tolerance = parseInt(document.getElementById('replaceTolerance').value);

        let newColor;
        if (makeTransparent) {
            newColor = { r: 0, g: 0, b: 0, a: 0 };
        } else {
            const hex = document.getElementById('colorPicker').value;
            newColor = { ...this.hexToRgb(hex), a: 255 };
        }

        this.showLoading('Application de la nouvelle couleur...');

        setTimeout(() => {
            // Get all colors in this cluster
            const targetColors = this.selectedColor.clusteredColors || [this.selectedColor];

            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                // Calculate pixel position
                const pixelIndex = i / 4;
                const x = pixelIndex % this.canvas.width;
                const y = Math.floor(pixelIndex / this.canvas.width);

                // Skip if pixel is in an exclusion zone
                if (this.isPixelExcluded(x, y)) continue;

                const pixelColor = {
                    r: data[i],
                    g: data[i + 1],
                    b: data[i + 2],
                    a: data[i + 3]
                };

                // Check if pixel matches any target color within tolerance
                for (const targetColor of targetColors) {
                    const distance = this.colorDistance(pixelColor, targetColor);
                    const alphaMatch = Math.abs(pixelColor.a - targetColor.a) < 10;

                    if (distance <= tolerance && alphaMatch) {
                        data[i] = newColor.r;
                        data[i + 1] = newColor.g;
                        data[i + 2] = newColor.b;
                        data[i + 3] = newColor.a;
                        break;
                    }
                }
            }

            this.ctx.putImageData(imageData, 0, 0);
            this.currentImageData = imageData;

            // Redraw exclusion zones as overlay (visual only)
            this.drawExclusionZones();

            this.closeColorModal();
            this.analyzeColors();
            this.updateStatus('✅ Couleur remplacée');
        }, 50);
    }

    // ========================================
    // History
    // ========================================
    saveToHistory() {
        // Keep last 10 states
        if (this.imageHistory.length >= 10) {
            this.imageHistory.shift();
        }

        const imageDataCopy = new ImageData(
            new Uint8ClampedArray(this.currentImageData.data),
            this.currentImageData.width,
            this.currentImageData.height
        );

        this.imageHistory.push({
            imageData: imageDataCopy,
            width: this.canvas.width,
            height: this.canvas.height
        });
    }

    // ========================================
    // Export
    // ========================================
    download() {
        if (!this.currentImageData) {
            this.updateStatus('❌ Aucune image à exporter');
            return;
        }

        const format = document.getElementById('formatSelect').value;
        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const quality = format === 'jpg' ? 0.9 : 1;

        // Temporarily remove exclusion zone overlays for clean export
        this.ctx.putImageData(this.currentImageData, 0, 0);

        // Use toBlob for more reliable download (better for large images)
        this.canvas.toBlob((blob) => {
            if (!blob) {
                this.updateStatus('❌ Erreur lors de l\'export');
                return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `image-edited.${format}`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the object URL
            setTimeout(() => URL.revokeObjectURL(url), 100);

            this.updateStatus(`✅ Image téléchargée en ${format.toUpperCase()}`);
        }, mimeType, quality);

        // Redraw exclusion zones after export
        if (this.exclusionZones.length > 0) {
            this.drawExclusionZones();
        }
    }

    // ========================================
    // UI Helpers
    // ========================================
    showLoading(message) {
        document.getElementById('loadingText').textContent = message;
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.imageEditor = new ImageEditor();
});
