const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Supported formats
const RASTER_FORMATS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff'];
const VECTOR_FORMATS = ['.svg', '.eps', '.ai'];

/**
 * Convert vector file (SVG/EPS/AI) to PNG
 * - SVG: Uses Sharp (no external dependency)
 * - EPS/AI: Uses Ghostscript (lightweight, ~50MB)
 */
async function convertVectorToPng(inputPath, outputPath) {
    const ext = path.extname(inputPath).toLowerCase();

    if (ext === '.svg') {
        // Use Sharp for SVG (faster and no external dependency)
        try {
            await sharp(inputPath)
                .png()
                .toFile(outputPath);
            return true;
        } catch (error) {
            console.log('Sharp SVG conversion failed:', error.message);
            throw new Error('SVG conversion failed: ' + error.message);
        }
    }

    // Use Ghostscript for EPS and AI files
    // AI files (post-CS era) are PDF-based, Ghostscript handles them well
    return await convertWithGhostscript(inputPath, outputPath);
}

/**
 * Convert EPS/AI to PNG using Ghostscript
 */
async function convertWithGhostscript(inputPath, outputPath) {
    // Ghostscript command for high-quality PNG output
    // -dSAFER: Restricts file operations for security
    // -dBATCH -dNOPAUSE: Non-interactive mode
    // -sDEVICE=png16m: 24-bit RGB PNG
    // -r300: 300 DPI for good quality
    // -dGraphicsAlphaBits=4 -dTextAlphaBits=4: Anti-aliasing

    const gsArgs = [
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOPROMPT',
        '-sDEVICE=png16m',
        '-r150',
        '-dGraphicsAlphaBits=4',
        '-dTextAlphaBits=4',
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`
    ].join(' ');

    // Try common Ghostscript command names
    const gsCommands = ['gs', 'gswin64c', 'gswin32c'];

    // Common installation paths on Windows
    const gsWindowsPaths = [
        // User's Ghostscript 10.06.0
        'C:\\Program Files (x86)\\gs\\gs10.06.0\\bin\\gswin64c.exe',
        'C:\\Program Files (x86)\\gs\\gs10.06.0\\bin\\gswin32c.exe',
        'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs10.02.0\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs10.01.2\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs10.01.1\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs10.00.0\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs9.56.1\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs9.55.0\\bin\\gswin64c.exe',
        'C:\\Program Files\\gs\\gs9.54.0\\bin\\gswin64c.exe',
        'C:\\Program Files (x86)\\gs\\gs10.02.1\\bin\\gswin32c.exe',
        'C:\\Program Files (x86)\\gs\\gs9.56.1\\bin\\gswin32c.exe'
    ];

    // Try PATH commands first
    for (const gsCmd of gsCommands) {
        try {
            const cmd = `${gsCmd} ${gsArgs}`;
            await execPromise(cmd);
            console.log(`✅ Converted with ${gsCmd}`);
            return true;
        } catch (error) {
            // Continue to next option
        }
    }

    // Try Windows installation paths
    for (const gsPath of gsWindowsPaths) {
        if (fs.existsSync(gsPath)) {
            try {
                const cmd = `"${gsPath}" ${gsArgs}`;
                await execPromise(cmd);
                console.log(`✅ Converted with ${gsPath}`);
                return true;
            } catch (error) {
                console.error(`Ghostscript path failed: ${gsPath}`, error.message);
            }
        }
    }

    // Try to find any gs installation dynamically on Windows
    const gsDirs = ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs'];
    for (const gsBaseDir of gsDirs) {
        try {
            if (fs.existsSync(gsBaseDir)) {
                const versions = fs.readdirSync(gsBaseDir);
                for (const version of versions.reverse()) {
                    for (const exe of ['gswin64c.exe', 'gswin32c.exe']) {
                        const gsPath = path.join(gsBaseDir, version, 'bin', exe);
                        if (fs.existsSync(gsPath)) {
                            try {
                                const cmd = `"${gsPath}" ${gsArgs}`;
                                await execPromise(cmd);
                                console.log(`✅ Converted with ${gsPath}`);
                                return true;
                            } catch (error) {
                                // Continue
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore directory scan errors
        }
    }

    throw new Error('Ghostscript not found. Install: https://ghostscript.com/releases/gsdnld.html (Windows) or apt install ghostscript (Linux)');
}


/**
 * Upload endpoint - handles both raster and vector files
 */
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const ext = path.extname(req.file.originalname).toLowerCase();
        const inputPath = req.file.path;
        let outputPath = inputPath;
        let needsConversion = false;

        // Check if vector format needs conversion
        if (VECTOR_FORMATS.includes(ext)) {
            needsConversion = true;
            outputPath = inputPath.replace(ext, '.png');

            try {
                await convertVectorToPng(inputPath, outputPath);
                // Delete original vector file after conversion
                fs.unlinkSync(inputPath);
            } catch (error) {
                fs.unlinkSync(inputPath);
                return res.status(500).json({
                    error: `Vector conversion failed: ${error.message}`,
                    needsInkscape: true
                });
            }
        } else if (!RASTER_FORMATS.includes(ext)) {
            fs.unlinkSync(inputPath);
            return res.status(400).json({ error: 'Unsupported file format' });
        }

        // Read the image and convert to base64 for client
        const imageBuffer = fs.readFileSync(outputPath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = 'image/png';

        // Clean up
        fs.unlinkSync(outputPath);

        res.json({
            success: true,
            image: `data:${mimeType};base64,${base64Image}`,
            originalName: req.file.originalname,
            wasConverted: needsConversion
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Save endpoint - save edited image
 */
app.post('/save', async (req, res) => {
    try {
        const { imageData, format = 'png', quality = 90 } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'No image data provided' });
        }

        // Remove data URL prefix
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        let outputBuffer;
        let mimeType;

        if (format === 'jpg' || format === 'jpeg') {
            outputBuffer = await sharp(imageBuffer)
                .jpeg({ quality: parseInt(quality) })
                .toBuffer();
            mimeType = 'image/jpeg';
        } else {
            outputBuffer = await sharp(imageBuffer)
                .png()
                .toBuffer();
            mimeType = 'image/png';
        }

        const base64Output = outputBuffer.toString('base64');

        res.json({
            success: true,
            image: `data:${mimeType};base64,${base64Output}`
        });

    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`🎨 Image Editor Server running at http://localhost:${PORT}`);
    console.log(`📁 Upload directory: ${uploadsDir}`);
});
