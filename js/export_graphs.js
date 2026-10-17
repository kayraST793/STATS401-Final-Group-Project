
async function exportSVGAsPNG(svg, filename, scale = 3) {
    const clone = svg.cloneNode(true);

    // Preserve the appearance of SVG elements.
    const originalElements = [svg, ...svg.querySelectorAll("*")];
    const clonedElements = [clone, ...clone.querySelectorAll("*")];

    originalElements.forEach((original, i) => {
        const computed = window.getComputedStyle(original);
        const target = clonedElements[i];
        if (!target) return;

        const properties = [
            "fill", "stroke", "stroke-width", "opacity",
            "font-family", "font-size", "font-weight",
            "text-anchor", "dominant-baseline",
            "display", "visibility"
        ];

        const styles = properties.map(
            p => `${p}:${computed.getPropertyValue(p)}`
        ).join(";");

        target.setAttribute("style", styles);
    });

    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    const width = viewBox.width || rect.width;
    const height = viewBox.height || rect.height;

    clone.setAttribute("width", width);
    clone.setAttribute("height", height);

    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], {
        type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const image = new Image();

    try {
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);

        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        const pngBlob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/png")
        );

        if (!pngBlob) throw new Error("PNG conversion failed");

        const downloadURL = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = downloadURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(downloadURL), 10000);
    } finally {
        URL.revokeObjectURL(url);
    }
}

document.getElementById("export-all-graphs")
    ?.addEventListener("click", async () => {

    const graphs = [
        ["#timeline", "timeline.png"],
        ["#scatter", "scatter.png"],
        ["#heatmap", "heatmap.png"],
        ["#chord", "chord.png"],
        ["#comparison", "comparison.png"]
    ];

    for (const [selector, filename] of graphs) {
        const svg = document.querySelector(`${selector} svg`);

        if (!svg) {
            console.warn(`No SVG found in ${selector}`);
            continue;
        }

        try {
            await exportSVGAsPNG(svg, filename, 3);
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`Failed to export ${filename}`, error);
        }
    }
});
