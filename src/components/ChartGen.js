import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
// Import the generic Chart component (this replaces Pie, Bar, etc. wrappers)
import { Chart } from 'react-chartjs-2'; 
import { 
    Chart as ChartJS, 
    // Core Elements (needed for all charts)
    Tooltip, 
    Legend, 
    
    // Chart Types and Scales
    ArcElement,           // For Pie, Doughnut
    CategoryScale,        // For Bar, Line, etc. (X-axis)
    LinearScale,          // For Bar, Line, etc. (Y-axis)
    PointElement,         // For Line, Scatter, Bubble
    LineElement,          // For Line
    BarElement,           // For Bar
    RadialLinearScale,    // For Radar, PolarArea
} from 'chart.js';

// Register all necessary elements dynamically
ChartJS.register(
    Tooltip, 
    Legend,
    ArcElement, 
    CategoryScale, 
    LinearScale, 
    PointElement,
    LineElement, 
    BarElement,
    RadialLinearScale
);

// --- Gradient and Color Helpers ---

/**
 * Function to reliably replace the opacity value with 1 (opaque) for gradient endpoints.
 * @param {string} rgbaColor - The input color string (e.g., "rgba(255, 99, 132, 0.6)")
 * @returns {string} The opaque color string (e.g., "rgba(255, 99, 132, 1)")
 */
const getOpaqueColor = (rgbaColor) => {
    if (!rgbaColor) return 'rgba(0, 0, 0, 1)';
    // Regex to find the last number in the string (the opacity value) and replace it with 1
    return rgbaColor.replace(/,\s*[\d\.]+\)$/, ', 1)');
};

/**
 * Creates a single CanvasGradient function for an entire dataset/series (used for grouped bar charts).
 * @param {object} series - The series object containing color and gradientType.
 * @returns {function} A function called once per dataset that returns a color string or a CanvasGradient object.
 */
const createSeriesGradient = (series) => {
    return function(context) {
        const color = series.color;
        const gradientType = series.gradient;
        
        if (gradientType === 'none' || !gradientType) {
            return color;
        }

        const chart = context.chart;
        const { ctx, chartArea } = chart;
        
        if (!chartArea) return color; 

        const opaqueColor = getOpaqueColor(color);
        
        // Linear Gradient (Best for Bar/Line charts - applied per series)
        if (gradientType === 'linear') {
            // Create a gradient that runs from the bottom to the top of the chart area
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, color);      
            gradient.addColorStop(1, opaqueColor); 
            return gradient;
        }

        // Fallback to original color if radial or invalid type for series
        return color;
    }
}


/**
 * Generates a Chart.js compatible function to create dynamic background colors or gradients 
 * (used for single-dataset charts like Pie, where color/gradient varies per data point).
 * @param {object} chartData - The data object for the current chart.
 * @returns {function} A function that returns a color string or a CanvasGradient object (called per slice/bar).
 */
const generateBackgroundPerDataPoint = (chartData) => {
    return function(context) {
        const index = context.dataIndex;
        const item = chartData.data[index];
        
        // Safety check to prevent 'item is undefined' errors from internal chart elements
        if (!item) {
            return 'transparent'; 
        }

        const color = item.color;
        const gradientType = item.gradient;

        // 1. Return static color if no gradient or gradient type is 'none'
        if (gradientType === 'none' || !gradientType) {
            return color;
        }

        const chart = context.chart;
        const { ctx, chartArea } = chart;
        
        // Safety check: chartArea is only defined once rendering starts
        if (!chartArea) return color; 

        const opaqueColor = getOpaqueColor(color);

        // 2. Linear Gradient 
        if (gradientType === 'linear' && (chartData.type === 'bar' || chartData.type === 'line')) {
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, color);      
            gradient.addColorStop(1, opaqueColor); 
            return gradient;
        }

        // 3. Radial Gradient (Best for Pie/Polar charts)
        if (gradientType === 'radial' && (chartData.type === 'pie' || chartData.type === 'polarArea')) {
            // Find the center of the chart area
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            // Estimate a maximum radius for the gradient
            const radius = Math.min(chartArea.width, chartArea.height) / 2;
            
            const gradient = ctx.createRadialGradient(
                centerX, centerY, 0,          // Inner circle (center, radius 0)
                centerX, centerY, radius      // Outer circle (center, max radius)
            );
            
            gradient.addColorStop(0, opaqueColor); // Opaque color at the center
            gradient.addColorStop(1, color);       // Translucent color at the edge
            return gradient;
        }

        // Fallback to original color
        return color;
    };
};


// --- ChartGen Component ---

const ChartGen = forwardRef(({ chartData }, ref) => {
    const chartRef = useRef(null);

    // 1. Expose a method to convert the canvas to Base64 image
    useImperativeHandle(ref, () => ({
        toBase64Image: () => {
            if (chartRef.current && chartRef.current.toBase64Image) {
                // Chart.js provides this method on the component's internal chart instance
                return chartRef.current.toBase64Image('image/png', 1.0); // PNG, 1.0 quality
            }
            return null;
        }
    }));
    // Determine if it's a single-dataset chart (legacy) or a multi-dataset chart (grouped)
    const isMultiDataset = chartData.type === 'bar' && Array.isArray(chartData.series) && chartData.series.length > 0;
    
    if (!chartData || (!isMultiDataset && (!chartData.data || chartData.data.length === 0))) {
        return <div className="p-4 text-center text-gray-500">No chart data available.</div>;
    }

    const dataForChartJS = {};

    if (isMultiDataset) {
        // --- Multi-Dataset (Grouped Bar) Logic ---
        dataForChartJS.labels = chartData.labels;

        dataForChartJS.datasets = chartData.series.map((series, index) => ({
            label: series.label,
            data: series.values,
            // Apply series-level gradient/color logic
            backgroundColor: createSeriesGradient(series), 
            borderColor: getOpaqueColor(series.color),
            borderWidth: 1,
            // Bar-specific styling for grouped charts
            // This is important for ensuring the hover effect uses the same color
            hoverBackgroundColor: getOpaqueColor(series.color), 
        }));

    } else {
        // --- Single-Dataset (Pie/Legacy Bar) Logic ---
        dataForChartJS.labels = chartData.data.map(item => item.label);
        
        dataForChartJS.datasets = [{
            label: chartData.title || 'Data Set',
            data: chartData.data.map(item => item.value),
            // Apply per-data-point gradient/color logic
            backgroundColor: generateBackgroundPerDataPoint(chartData), 
            borderColor: chartData.data.map(item => getOpaqueColor(item.color)),
            borderWidth: 1,
            // Line/Point properties
            tension: chartData.type === 'line' ? 0.4 : 0, 
            pointBackgroundColor: chartData.type === 'line' ? chartData.data.map(item => getOpaqueColor(item.color)) : undefined,
            pointBorderColor: '#fff',
            pointRadius: chartData.type === 'line' ? 5 : 0,
        }];
    }

    // Define Options
    const options = {
        responsive: true,
        maintainAspectRatio: true, 
        plugins: {
            legend: {
                position: chartData.type === 'pie' || chartData.type === 'polarArea' ? 'right' : 'top',
                labels: {
                    boxWidth: 20,
                    padding: 15,
                }
            },
            title: {
                display: false, 
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                bodyFont: { size: 14 },
                titleFont: { size: 16, weight: 'bold' },
            }
        },
        // Scales only apply to cartesian charts (bar, line, scatter)
        scales: (chartData.type === 'bar' || chartData.type === 'line') ? {
            x: {
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(200, 200, 200, 0.2)' }
            }
        } : (chartData.type === 'radar' || chartData.type === 'polarArea') ? {
            // Options specific to radial charts
            r: {
                beginAtZero: true,
                grid: { color: 'rgba(200, 200, 200, 0.2)' }
            }
        } : {},
    };

    return (
        <div className="h-full p-1 bg-white rounded-lg shadow-lg">
            {/* 2. Attach ref to the Chart component */}
            <Chart 
                ref={chartRef}
                type={chartData.type} 
                data={dataForChartJS} 
                options={options} 
            />
        </div>
    );
});

export default ChartGen;