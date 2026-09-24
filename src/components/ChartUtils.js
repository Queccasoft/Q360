// ChartUtils.js

import React from 'react';
import { Path, Text, View, Svg, Defs, RadialGradient, Stop, LinearGradient, G } from '@react-pdf/renderer';

// --- Constants and Configuration ---
const CHART_WIDTH = 400;
const CHART_HEIGHT = 200;
const PADDING = 20;

// --- Gradient Definitions (react-pdf <Defs>) ---

const renderGradients = (data, chartType) => {
    if (chartType === 'pie' && data.some(d => d.gradient !== 'none')) {
        return (
            <Defs>
                {data.map((slice, index) => slice.gradient === 'radial' && (
                    <RadialGradient 
                        key={`radial-${index}`} 
                        id={`radial-grad-${index}`} 
                        cx="50%" cy="50%" r="50%" 
                        fx="50%" fy="50%"
                    >
                        <Stop offset="0%" stopColor={slice.color.replace(/, \d\.\d\)/, ', 1)')} />
                        <Stop offset="100%" stopColor={slice.color.replace(/, \d\.\d\)/, ', 0.3)')} />
                    </RadialGradient>
                ))}
            </Defs>
        );
    }
    if (chartType === 'bar') {
        // Grouped bar chart series can have the gradient defined in the series object
        // For single bar charts, the gradient is on the data point
        const seriesOrData = data.series || data.data;

        return (
            <Defs>
                {seriesOrData.map((item, index) => item.gradient === 'linear' && (
                    <LinearGradient 
                        key={`linear-${index}`} 
                        id={`linear-grad-${index}`} 
                        x1="0" y1="0" x2="0" y2="100%"
                    >
                        <Stop offset="0%" stopColor={item.color.replace(/, \d\.\d\)/, ', 1)')} stopOpacity={1}/>
                        <Stop offset="100%" stopColor={item.color.replace(/, \d\.\d\)/, ', 0.1)')} stopOpacity={0.1}/>
                    </LinearGradient>
                ))}
            </Defs>
        );
    }
    return null;
};

// --- Pie Chart Drawing Logic ---

// Helper function to get X and Y coordinates on the circle perimeter
const getCoords = (cx, cy, radius, angle) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
});

// The core Path generator
const getPieSlicePath = (cx, cy, radius, startAngle, endAngle) => {
    // Math.cos and Math.sin expect radians
    const start = getCoords(cx, cy, radius, startAngle);
    const end = getCoords(cx, cy, radius, endAngle);

    // Large Arc Flag: 1 if the arc is > 180 degrees, 0 otherwise
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    // SVG Path: 
    // M cx cy (Move to Center)
    // L start.x start.y (Line to start of arc)
    // A radius radius 0 largeArcFlag 1 end.x end.y (Arc to end)
    // Z (Close path back to center)
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
};

// Corrected renderPieChart function in ChartUtils.js

// export const renderPieChart = (chartData) => {
//     const { data } = chartData;
//     const total = data.reduce((sum, item) => sum + item.value, 0);
//     const radius = CHART_HEIGHT / 2 - PADDING;
//     const cx = CHART_WIDTH / 2;
//     const cy = CHART_HEIGHT / 2;
//     // Start angle is -90 degrees (or -Math.PI / 2 radians) to begin at 12 o'clock
//     let currentAngle = -Math.PI / 2; 

//     return (
//         <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
//             {renderGradients(data, 'pie')}
            
//             {/* NO <G> ROTATION. We incorporate the rotation into the starting angle. */}
//             {data.map((slice, index) => {
//                 const angle = (slice.value / total) * 2 * Math.PI;
//                 const endAngle = currentAngle + angle;
                
//                 // 1. Path Calculation
//                 const pathD = getPieSlicePath(cx, cy, radius, currentAngle, endAngle);
                
//                 // 2. Fill Color/Gradient Check
//                 const fill = slice.gradient === 'radial' ? `url(#radial-grad-${index})` : slice.color;

//                 // 3. Label Position Calculation (for text)
//                 const midAngle = currentAngle + angle / 2;
//                 const labelRadius = radius / 1.5; 
//                 const label = `${slice.label} (${((slice.value / total) * 100).toFixed(0)}%)`;

//                 const labelPos = getCoords(cx, cy, labelRadius, midAngle);

//                 currentAngle = endAngle;

//                 return (
//                     <React.Fragment key={index}>
//                         <Path 
//                             d={pathD} 
//                             fill={fill.replace(/, [\d\.]+?\)/, ', 1)')} 
//                             stroke="white" 
//                             strokeWidth={1}
//                         />
//                         {/* No complex rotation on the text element itself */}
//                         <Text 
//                             x={labelPos.x} 
//                             y={labelPos.y + 3} // Slight Y adjustment for vertical centering
//                             fontSize={8} 
//                             textAnchor="middle" 
//                         >
//                             {label}
//                         </Text>
//                     </React.Fragment>
//                 );
//             })}
//         </Svg>
//     );
// };

// Modified renderPieChart function in ChartUtils.js (handles both pie and doughnut)

const OUTER_RADIUS_RATIO = 0.95; // Max radius relative to height
const INNER_RADIUS_RATIO = 0.5;  // Inner radius for doughnut

export const renderPieChart = (chartData) => {
    const { data, type } = chartData;
    const isDoughnut = type === 'doughnut';
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const cx = CHART_WIDTH / 2;
    const cy = CHART_HEIGHT / 2;

    // Calculate radii
    const outerRadius = (CHART_HEIGHT / 2 - PADDING) * OUTER_RADIUS_RATIO;
    const innerRadius = isDoughnut ? outerRadius * INNER_RADIUS_RATIO : 0; 
    
    // Start angle is -90 degrees (or -Math.PI / 2 radians) to begin at 12 o'clock
    let currentAngle = -Math.PI / 2; 

    return (
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
            {renderGradients(data, 'pie')}
            
            {/* RENDER WITHOUT G ROTATION */}
            {data.map((slice, index) => {
                const angle = (slice.value / total) * 2 * Math.PI;
                const endAngle = currentAngle + angle;
                
                // 1. Path Calculation (uses correct function based on type)
                const pathD = isDoughnut
                    ? getDoughnutSlicePath(cx, cy, outerRadius, innerRadius, currentAngle, endAngle)
                    : getPieSlicePath(cx, cy, outerRadius, currentAngle, endAngle);

                // 2. Fill Color/Gradient Check
                const fill = slice.gradient === 'radial' ? `url(#radial-grad-${index})` : slice.color;

                // 3. Label Position Calculation (for text)
                const labelRadius = innerRadius + (outerRadius - innerRadius) / 2; // Mid-thickness
                const midAngle = currentAngle + angle / 2;
                const label = `${slice.label} (${((slice.value / total) * 100).toFixed(0)}%)`;

                const labelPos = getCoords(cx, cy, labelRadius, midAngle);

                currentAngle = endAngle;

                return (
                    <React.Fragment key={index}>
                        <Path 
                            d={pathD} 
                            // Ensure the fill is robust (removing alpha and setting to 1 if needed for react-pdf fill)
                            fill={fill.replace(/, [\d\.]+?\)/, ', 1)')} 
                            stroke="white" 
                            strokeWidth={1}
                        />
                        {/* No complex rotation on the text element itself */}
                        <Text 
                            x={labelPos.x} 
                            y={labelPos.y + 3} // Slight Y adjustment for vertical centering
                            fontSize={8} 
                            textAnchor="middle" 
                        >
                            {label}
                        </Text>
                    </React.Fragment>
                );
            })}
        </Svg>
    );
};

// New helper function in ChartUtils.js
const getDoughnutSlicePath = (cx, cy, outerRadius, innerRadius, startAngle, endAngle) => {
    // 1. Outer arc start/end points
    const outerStartX = cx + outerRadius * Math.cos(startAngle);
    const outerStartY = cy + outerRadius * Math.sin(startAngle);
    const outerEndX = cx + outerRadius * Math.cos(endAngle);
    const outerEndY = cy + outerRadius * Math.sin(endAngle);

    // 2. Inner arc start/end points (reversed direction for the inner path)
    const innerEndX = cx + innerRadius * Math.cos(startAngle);
    const innerEndY = cy + innerRadius * Math.sin(startAngle);
    const innerStartX = cx + innerRadius * Math.cos(endAngle);
    const innerStartY = cy + innerRadius * Math.sin(endAngle);

    // Large Arc Flag: 1 if the arc is > 180 degrees, 0 otherwise
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    // Path construction sequence:
    // M: Move to Outer Start
    // A: Draw Outer Arc to Outer End
    // L: Line to Inner End (Closing the outer/inner gap)
    // A: Draw Inner Arc to Inner Start (Must use sweep-flag=0 for counter-clockwise)
    // Z: Close the Path back to Outer Start

    return `
        M ${outerStartX} ${outerStartY}
        A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}
        L ${innerStartX} ${innerStartY}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerEndX} ${innerEndY}
        Z
    `;
};

// --- Bar Chart Drawing Logic ---

export const renderBarChart = (chartData) => {
    const { data, labels, series } = chartData;
    const isGrouped = !!series;
    
    // Determine the data source and values
    const allValues = isGrouped 
        ? series.flatMap(s => s.values) 
        : data.map(d => d.value);

    const chartAreaHeight = CHART_HEIGHT - 2 * PADDING;
    const chartAreaWidth = CHART_WIDTH - 2 * PADDING;
    const maxValue = Math.max(...allValues);
    const numBars = isGrouped ? labels.length : data.length;
    const numSeries = isGrouped ? series.length : 1;

    // Bar dimensions
    const totalBarGroupWidth = chartAreaWidth / numBars;
    const gapBetweenGroups = totalBarGroupWidth * 0.1;
    const barWidth = (totalBarGroupWidth - gapBetweenGroups) / numSeries;
    const barGroupStartX = PADDING + gapBetweenGroups / 2;

    const barElements = [];
    let legendData = [];

    const drawBar = (value, color, gradient, xOffset, seriesIndex) => {
        const barHeight = (value / maxValue) * chartAreaHeight;
        const y = chartAreaHeight + PADDING - barHeight;
        const x = barGroupStartX + xOffset;
        const fill = gradient === 'linear' 
            ? `url(#linear-grad-${seriesIndex})` 
            : color.replace(/, [\d\.]+?\)/, ', 1)'); // The replace here causes problem if gradients arent "none" (like "radial"). This is just a temporary fix!
        
        barElements.push(
            <Path
                key={`bar-${x}-${y}`}
                d={`M ${x} ${chartAreaHeight + PADDING} V ${y} H ${x + barWidth} V ${chartAreaHeight + PADDING} Z`}
                fill={fill}
                // stroke={color.replace(/, \d\.\d\)/, ', 1)')}
                // strokeWidth={0.5}
            />
        );
        // Add label text on top of the bar
        barElements.push(
            <Text
                key={`text-${x}-${y}`}
                x={x + barWidth / 2}
                y={y - 5}
                fontSize={8}
                textAnchor="middle"
            >
                {value}
            </Text>
        );
    };

    if (isGrouped) {
        legendData = series;
        series.forEach((s, sIndex) => {
            s.values.forEach((value, lIndex) => {
                const barGroupOffset = lIndex * totalBarGroupWidth;
                const barInGroupOffset = sIndex * barWidth;
                const xOffset = barGroupOffset + barInGroupOffset;
                drawBar(value, s.color, s.gradient, xOffset, sIndex);
            });
        });
    } else {
        legendData = data;
        data.forEach((d, index) => {
            const xOffset = index * totalBarGroupWidth + totalBarGroupWidth * 0.1; // Small offset for single bars
            drawBar(d.value, d.color, d.gradient, xOffset, index); // Single series has index 0
        });
    }

    // Y-Axis and X-Axis lines
    const xAxisY = chartAreaHeight + PADDING;
    barElements.push(
        <Path key="y-axis" d={`M ${PADDING} ${PADDING} V ${xAxisY} H ${CHART_WIDTH - PADDING}`} stroke="black" strokeWidth={1} />
    );

    // Y-Axis Labels (Simple top/bottom)
    barElements.push(
        <Text key="y-max" x={PADDING - 5} y={PADDING + 5} fontSize={8} textAnchor="end">{maxValue}</Text>
    );
    barElements.push(
        <Text key="y-zero" x={PADDING - 5} y={xAxisY + 5} fontSize={8} textAnchor="end">0</Text>
    );

    // X-Axis Labels (Labels for each group/bar)
    const currentLabels = isGrouped ? labels : data.map(d => d.label);
    currentLabels.forEach((label, index) => {
        const xCenter = barGroupStartX + index * totalBarGroupWidth + totalBarGroupWidth / 2;
        barElements.push(
            <Text key={`x-label-${index}`} x={xCenter} y={xAxisY + 10} fontSize={8} textAnchor="middle">
                {label}
            </Text>
        );
    });

    return (
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT + PADDING * 2}>
            {renderGradients(chartData, 'bar')}
            {barElements}
            {/* Render Legend Below the chart */}
            <G transform={`translate(0, ${CHART_HEIGHT + PADDING * 2 - 10})`}>
                {legendData.map((item, index) => (
                    <G key={index} transform={`translate(${index * 120}, 0)`}>
                        <Path d="M 0 0 H 10 V 10 H 0 Z" fill={item.color.replace(/, [\d\.]+?\)/, ', 1)')} />
                        <Text x={15} y={8} fontSize={8}>{item.label}</Text>
                    </G>
                ))}
            </G>
        </Svg>
    );
};

// Helper function to get the coordinate for a data point
const getPointCoords = (value, index, maxValue, numPoints, chartAreaWidth, chartAreaHeight) => {
    // X coordinate: Distribute points evenly along the width
    const x = PADDING + (index / (numPoints - 1)) * chartAreaWidth;
    
    // Y coordinate: Scale value to height, remembering Y=0 is the top of the SVG
    // The chart bottom is at chartAreaHeight + PADDING
    const y = (chartAreaHeight + PADDING) - (value / maxValue) * chartAreaHeight;

    return { x, y };
};

// --- Line Chart Drawing Logic ---

export const renderLineChart = (chartData) => {
    const { data } = chartData;
    
    const chartAreaHeight = CHART_HEIGHT - 2 * PADDING;
    const chartAreaWidth = CHART_WIDTH - 2 * PADDING;
    
    const values = data.map(d => d.value);
    const maxValue = Math.max(...values);
    const numPoints = data.length;

    const xAxisY = chartAreaHeight + PADDING;
    const chartElements = [];

    // 1. Draw Axes
    chartElements.push(
        <Path 
            key="axes" 
            d={`M ${PADDING} ${PADDING} V ${xAxisY} H ${CHART_WIDTH - PADDING}`} 
            stroke="black" 
            strokeWidth={1} 
        />
    );

    // 2. Draw Multi-Segment Colored Line
    for (let i = 1; i < numPoints; i++) {
        const current = data[i];
        const prev = data[i - 1];

        const { x: currX, y: currY } = getPointCoords(current.value, i, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        const { x: prevX, y: prevY } = getPointCoords(prev.value, i - 1, maxValue, numPoints, chartAreaWidth, chartAreaHeight);

        // Draw a Path segment from the previous point to the current point
        // Use the color of the current point (data[i]) for the segment leading to it.
        chartElements.push(
            <Path 
                key={`line-segment-${i}`} 
                d={`M ${prevX} ${prevY} L ${currX} ${currY}`} 
                stroke={current.color.replace(/, \d\.\d\)/, ', 1)')} // Use solid color (opacity 1)
                strokeWidth={3}
                fill="none"
            />
        );
    }
    
    // 3. Draw Points, Values, and Labels
    data.forEach((d, index) => {
        const { x: px, y: py } = getPointCoords(d.value, index, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        
        // Draw a circle/point marker
        chartElements.push(
            <Path 
                key={`point-${index}`}
                d={`M ${px - 4} ${py} A 4 4 0 1 0 ${px + 4} ${py} A 4 4 0 1 0 ${px - 4} ${py}`} // Draws a small circle
                fill="white" // White center for better contrast
                stroke={d.color.replace(/, \d\.\d\)/, ', 1)')}
                strokeWidth={2}
            />
        );
        
        // Value Text
        chartElements.push(
            <Text 
                key={`value-${index}`} 
                x={px} 
                y={py - 10} // Adjusted position to be slightly higher
                fontSize={8} 
                textAnchor="middle"
            >
                {d.value}
            </Text>
        );

        // X-Axis Label Text
        chartElements.push(
            <Text 
                key={`x-label-${index}`} 
                x={px} 
                y={xAxisY + 10} 
                fontSize={8} 
                textAnchor="middle"
            >
                {d.label}
            </Text>
        );
    });

    // 4. Draw Y-Axis Labels (Max and Zero)
    chartElements.push(
        <Text key="y-max" x={PADDING - 5} y={PADDING + 5} fontSize={8} textAnchor="end">{maxValue}</Text>
    );
    chartElements.push(
        <Text key="y-zero" x={PADDING - 5} y={xAxisY + 5} fontSize={8} textAnchor="end">0</Text>
    );

    return (
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT + PADDING * 2}>
            <G transform={`translate(0, 0)`}>
                {chartElements}
            </G>
        </Svg>
    );
};

// --- Line Pictograph Logic ---
export const renderPictograph = (chartData) => {
    const { data, unitValue = 10 } = chartData; // unitValue defines what one icon represents
    
    const chartAreaWidth = CHART_WIDTH - 2 * PADDING;
    const itemHeight = 40; // Height of the row for each data item
    const iconSize = 10;
    const iconsPerRow = 20;
    const iconSpacing = (chartAreaWidth - (iconsPerRow * iconSize)) / (iconsPerRow - 1);

    let currentY = PADDING;
    const elements = [];

    data.forEach((item, itemIndex) => {
        const totalIcons = Math.ceil(item.value / unitValue);
        const fullIcons = Math.floor(item.value / unitValue);
        const remainder = item.value % unitValue;
        const fractionalIcon = remainder / unitValue;

        // 1. Draw Label
        elements.push(
            <Text 
                key={`label-${itemIndex}`} 
                x={PADDING} 
                y={currentY + 10} 
                fontSize={10}
            >
                {item.label + " (" +item.value + ")"}  
            </Text>
        );

        // 2. Draw Icons
        for (let i = 0; i < totalIcons; i++) {
            const row = Math.floor(i / iconsPerRow);
            const col = i % iconsPerRow;
            
            const x = PADDING + col * (iconSize + iconSpacing);
            const y = currentY + itemHeight + row * (iconSize + 5);

            let width = iconSize;
            let opacity = 1;

            if (i === fullIcons) {
                // This is the fractional icon
                width = iconSize * fractionalIcon;
                opacity = 1;
            } else if (i > fullIcons) {
                // Skip icons beyond the total value
                continue;
            }

            elements.push(
                <Path 
                    key={`icon-${itemIndex}-${i}`}
                    d={`M ${x} ${y} H ${x + width} V ${y + iconSize} H ${x} Z`}
                    fill={item.color.replace(/, [\d\.]+?\)/, ', 1)') || 'gray'}
                    opacity={opacity}
                    stroke="none"
                />
            );
        }

        // Advance Y for the next item
        const numRows = Math.ceil(totalIcons / iconsPerRow);
        currentY += itemHeight + numRows * (iconSize + 5) + 10;
    });

    return (
        <Svg width={CHART_WIDTH} height={currentY + PADDING}>
            {elements}
        </Svg>
    );
};

// --- Bubble Chart Logic ---
export const renderBubbleChart = (chartData) => {
    const { data } = chartData; // Expects data to have: { label, value, color }

    const chartAreaHeight = CHART_HEIGHT - 2 * PADDING;
    const chartAreaWidth = CHART_WIDTH - 2 * PADDING;

    // Determine max values for scaling
    const maxZValue = Math.max(...data.map(d => d.value)); // Max value determines max radius
    const maxYValue = maxZValue; // Use the max value for Y-axis scaling as well

    const MAX_BUBBLE_RADIUS = 20;
    const numPoints = data.length;

    const elements = [];
    const xAxisY = chartAreaHeight + PADDING;

    // 1. Draw Axes
    elements.push(
        <Path key="axes" d={`M ${PADDING} ${PADDING} V ${xAxisY} H ${CHART_WIDTH - PADDING}`} stroke="black" strokeWidth={1} />
    );

    // 2. Draw Y-Axis labels (Min/Max)
    elements.push(<Text key="y-zero" x={PADDING - 5} y={xAxisY + 5} fontSize={8} textAnchor="end">0</Text>);
    elements.push(<Text key="y-max" x={PADDING - 5} y={PADDING + 5} fontSize={8} textAnchor="end">{maxYValue}</Text>);

    // 3. Draw Bubbles
    data.forEach((point, index) => {
        
        // Auto X: Based on index (evenly distributed)
        const xOffset = chartAreaWidth / (numPoints + 1);
        const cx = PADDING + xOffset * (index + 1);
        
        // Auto Y: Based on value (inverted, high value = high position)
        const cy = (chartAreaHeight + PADDING) - (point.value / maxYValue) * chartAreaHeight;
        
        // Z: Scale value to bubble radius
        const r = (point.value / maxZValue) * MAX_BUBBLE_RADIUS;

        // Bubble Path (M cx-r cy -> A r r 0 1 0 cx+r cy -> A r r 0 1 0 cx-r cy)
        elements.push(
            <Path
                key={`bubble-${index}`}
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`}
                fill={point.color.replace(/, [\d\.]+?\)/, ', 1)') || 'blue'}
                //opacity={0.1}
                //stroke={point.color || 'blue'}
                //strokeWidth={1}
            />
        );

        // X-Axis Label (Data point label, placed below X-axis)
        elements.push(
            <Text key={`x-label-${index}`} x={cx} y={xAxisY + 10} fontSize={8} textAnchor="middle">
                {point.label}
            </Text>
        );

        // Label (Value inside bubble)
        elements.push(
            <Text 
                key={`text-${index}`} 
                x={cx} 
                y={cy + 3} 
                fontSize={8} 
                textAnchor="middle" 
                fill="black"
            >
                {point.value}
            </Text>
        );
    });

    return (
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT + PADDING * 2}>
            {elements}
        </Svg>
    );
};

// New function in ChartUtils.js (based on renderLineChart)

export const renderAreaChart = (chartData) => {
    const { data, color } = chartData; 
    
    const chartAreaHeight = CHART_HEIGHT - 2 * PADDING;
    const chartAreaWidth = CHART_WIDTH - 2 * PADDING;
    
    const values = data.map(d => d.value);
    const maxValue = Math.max(...values);
    const numPoints = data.length;
    const xAxisY = chartAreaHeight + PADDING; // Y-coordinate of the baseline (X-axis)

    let pathD = "";
    const chartElements = [];
    
    // --- 1. Calculate the Line Path and close the area ---
    
    // Start the path at the first point on the X-axis (bottom-left of the area)
    const firstCoords = getPointCoords(data[0].value, 0, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
    
    // Move to the bottom-left corner of the chart area (start of X-axis)
    pathD += `M ${firstCoords.x} ${xAxisY}`; 
    
    // Move up to the first data point
    pathD += `L ${firstCoords.x} ${firstCoords.y}`;

    // Now, trace the line across all data points
    for (let index = 1; index < numPoints; index++) {
        const d = data[index];
        const { x, y } = getPointCoords(d.value, index, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        pathD += `L ${x} ${y}`; // Line segment to the current data point
    }
    
    // Close the area: Draw line down to the last point on the X-axis
    const lastCoords = getPointCoords(data[numPoints - 1].value, numPoints - 1, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
    pathD += `L ${lastCoords.x} ${xAxisY}`; 
    
    // Close the loop back to the starting X-axis point (optional, as Z does this)
    pathD += ` Z`; 

    // --- 2. Draw the Filled Area Path ---
    
    chartElements.push(
        <Path 
            key="area" 
            d={pathD} 
            fill={color || 'rgba(54, 162, 235, 1)'} // Fill with color (using 50% opacity)
            stroke={color || 'blue'} // Add a clear border line
            strokeWidth={1}
            opacity={0.5}
        />
    );
    
    // --- 3. Draw Axes and Labels (Copied from Line Chart) ---

    // Axes
    chartElements.push(
        <Path key="axes" d={`M ${PADDING} ${PADDING} V ${xAxisY} H ${CHART_WIDTH - PADDING}`} stroke="black" strokeWidth={1} />
    );

    // X-Axis Labels
    data.forEach((d, index) => {
        const xCenter = PADDING + (index / (numPoints - 1)) * chartAreaWidth;
        chartElements.push(
            <Text key={`x-label-${index}`} x={xCenter} y={xAxisY + 10} fontSize={8} textAnchor="middle">
                {d.label}
            </Text>
        );
        // Optional: Draw a small circle/point marker on the area boundary
        const { x: px, y: py } = getPointCoords(d.value, index, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        chartElements.push(
            <Path 
                key={`point-${index}`}
                d={`M ${px - 2} ${py} A 2 2 0 1 0 ${px + 2} ${py} A 2 2 0 1 0 ${px - 2} ${py}`} 
                fill={color || 'blue'}
            />
        );
    });

    // Y-Axis Labels (Max and Zero)
    chartElements.push(
        <Text key="y-max" x={PADDING - 5} y={PADDING + 5} fontSize={8} textAnchor="end">{maxValue}</Text>
    );
    chartElements.push(
        <Text key="y-zero" x={PADDING - 5} y={xAxisY + 5} fontSize={8} textAnchor="end">0</Text>
    );

    return (
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT + PADDING * 2}>
            <G transform={`translate(0, 0)`}>
                {chartElements}
            </G>
        </Svg>
    );
};

export const renderAreaChart2 = (chartData) => {
    const { data } = chartData; 
    
    const chartAreaHeight = CHART_HEIGHT - 2 * PADDING;
    const chartAreaWidth = CHART_WIDTH - 2 * PADDING;
    
    const values = data.map(d => d.value);
    const maxValue = Math.max(...values);
    const numPoints = data.length;
    const xAxisY = chartAreaHeight + PADDING; 
    
    const chartElements = [];
    
    // 1. Draw Area Segments (The multi-colored fill)
    for (let i = 0; i < numPoints - 1; i++) {
        // Current point (P1) and its color
        const p1 = data[i];
        const p1Coords = getPointCoords(p1.value, i, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        
        // Next point (P2)
        const p2 = data[i + 1];
        const p2Coords = getPointCoords(p2.value, i + 1, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        
        // Define the closed shape for the segment:
        // M: Move to (P1 at X-axis)
        // L: Line to (P1 at its value)
        // L: Line to (P2 at its value)
        // L: Line to (P2 at X-axis)
        // Z: Close path back to (P1 at X-axis)
        const segmentD = `
            M ${p1Coords.x} ${xAxisY} 
            L ${p1Coords.x} ${p1Coords.y} 
            L ${p2Coords.x} ${p2Coords.y} 
            L ${p2Coords.x} ${xAxisY}
            Z
        `;
        
        // Use the color associated with the starting data point of the segment
        const segmentColor = p1.color || 'gray'; 

        chartElements.push(
            <Path 
                key={`area-segment-${i}`} 
                d={segmentD} 
                fill={segmentColor.replace(/, [\d\.]+?\)/, ', 1)')} // Ensure some transparency for overlap, set alpha to 0.6
                stroke={segmentColor.replace(/, [\d\.]+?\)/, ', 1)')} // Use full opacity for stroke
                strokeWidth={0.1}
            />
        );
    }
    
    // 2. Draw the continuous Line on top for visual clarity
    let lineD = "";
    data.forEach((d, index) => {
        const { x, y } = getPointCoords(d.value, index, maxValue, numPoints, chartAreaWidth, chartAreaHeight);
        lineD += index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    });

    chartElements.push(
        <Path
            key="top-line"
            d={lineD}
            stroke="black" // A clear line to connect the tops of the colored areas
            strokeWidth={2}
            fill="none"
        />
    );


    // --- 3. Draw Axes and Labels (Copied from previous logic) ---

    // Axes
    chartElements.push(
        <Path key="axes" d={`M ${PADDING} ${PADDING} V ${xAxisY} H ${CHART_WIDTH - PADDING}`} stroke="black" strokeWidth={1} />
    );

    // X-Axis Labels
    data.forEach((d, index) => {
        const xCenter = PADDING + (index / (numPoints - 1)) * chartAreaWidth;
        chartElements.push(
            <Text key={`x-label-${index}`} x={xCenter} y={xAxisY + 10} fontSize={8} textAnchor="middle">
                {d.label}
            </Text>
        );
    });

    // Y-Axis Labels (Max and Zero)
    chartElements.push(
        <Text key="y-max" x={PADDING - 5} y={PADDING + 5} fontSize={8} textAnchor="end">{maxValue}</Text>
    );
    chartElements.push(
        <Text key="y-zero" x={PADDING - 5} y={xAxisY + 5} fontSize={8} textAnchor="end">0</Text>
    );

    return (
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT + PADDING * 2}>
            <G transform={`translate(0, 0)`}>
                {chartElements}
            </G>
        </Svg>
    );
};

// --- Main Chart Renderer ---

// In ChartUtils.js
export const renderChart = (chartData) => {
    switch (chartData.type) {
        case 'pie':
        case 'doughnut':
            return renderPieChart(chartData); 
        case 'bar':
            return renderBarChart(chartData);
        case 'line':
            return renderLineChart(chartData); 
        case 'area':
            return renderAreaChart(chartData);
        case 'area2':
            return renderAreaChart2(chartData);
        case 'pictograph':
            return renderPictograph(chartData);
        case 'bubble':
            return renderBubbleChart(chartData);
        default:
            return <Text>Unsupported Chart Type: {chartData.type}</Text>;
    }
};