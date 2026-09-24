/**
 * Transforms the monthly attendance aggregation into a pie chart compatible format,
 * aggregating counts across the entire year.
 *
 * @param {Object[]} aggregatedData - The monthly data array.
 * @param {Object[]} statusApiData - The status definitions from the API.
 * @returns {Object} The chart-compatible JSON object for a pie chart.
 */
export const transformToPieChartData = (aggregatedData, statusApiData) => {
    if (!aggregatedData || aggregatedData.length === 0) return {};

    // 1. Create maps for quick lookup and total counts
    const statusDetailsMap = statusApiData.reduce((acc, status) => {
        acc[status.id] = { name: status.name, color: status.color };
        return acc;
    }, {});
    
    // Total counts for the year: { statusId: totalCount, ... }
    const annualCounts = {};

    // 2. Aggregate all monthly counts into annualCounts
    aggregatedData.forEach(monthData => {
        monthData.aggregateStats.forEach(stat => {
            const id = stat.statusId;
            annualCounts[id] = (annualCounts[id] || 0) + stat.value;
        });
    });

    // 3. Convert the annual counts into the required 'data' array format
    const chartData = Object.keys(annualCounts)
        .filter(statusId => statusDetailsMap[statusId]) // Only include statuses with API definitions
        .map(statusId => {
            const id = parseInt(statusId, 10);
            const statusDetail = statusDetailsMap[id];
            
            return {
                label: statusDetail.name,
                value: annualCounts[id],
                color: hexToRgba(statusDetail.color), // Re-use the hexToRgba helper
                gradient: "radial" // Fixed value
            };
        })
        // Optional: Filter out zero-value statuses for cleaner pie chart
        .filter(item => item.value > 0); 

    // 4. Return the final chart JSON structure
    return {
        title: "Annual Attendance Aggregate (Pie - Radial)",
        type: "pie",
        data: chartData
    };
};

/**
 * Converts a hex color string (e.g., "#ff0000") to an RGBA string with a fixed opacity.
 * @param {string} hex - The hex color code.
 * @param {number} opacity - The desired opacity (0 to 1).
 * @returns {string} The rgba() string.
 */
export const hexToRgba = (hex, opacity = 0.6) => {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * Transforms the monthly attendance aggregation into a chart-compatible format.
 *
 * @param {Object[]} aggregatedData - The monthly data array (output of the first function).
 * @param {Object[]} statusApiData - The status definitions from the API.
 * @returns {Object} The chart-compatible JSON object.
 */
export const transformToGroupedBarChartData = (aggregatedData, statusApiData) => {
    if (!aggregatedData || aggregatedData.length === 0) return {};

    // 1. Create a map for quick lookup: { statusId: { name: "...", color: "..." } }
    const statusDetailsMap = statusApiData.reduce((acc, status) => {
        acc[status.id] = { name: status.name, color: status.color };
        return acc;
    }, {});

    // 2. Determine all unique status IDs present in the data
    const uniqueStatusIds = Array.from(
        new Set(
            aggregatedData.flatMap(monthData =>
                monthData.aggregateStats.map(stat => stat.statusId)
            )
        )
    );

    // 3. Initialize the series object for the chart
    const initialSeries = uniqueStatusIds
        .filter(id => statusDetailsMap[id])
        .map(statusId => ({
            id: statusId, // Temporary ID for easy mapping
            label: statusDetailsMap[statusId].name,
            values: [], // To be filled in step 5
            color: hexToRgba(statusDetailsMap[statusId].color),
            gradient: "linear"
        }));

    // 4. Extract Labels (Months)
    const labels = aggregatedData.map(data => data.month);

    // 5. Populate the values for each series
    initialSeries.forEach(series => {
        // Iterate over all months (labels)
        labels.forEach(month => {
            const monthData = aggregatedData.find(data => data.month === month);
            if (monthData) {
                // Find the specific status value for this month
                const stat = monthData.aggregateStats.find(s => s.statusId === series.id);

                // If found, push the value; otherwise, push 0
                series.values.push(stat ? stat.value : 0);
            } else {
                series.values.push(0);
            }
        });
    });

    // 6. Return the final chart JSON structure
    return {
        title: "Yearly Attendance (Grouped Bar)",
        type: "bar",
        labels: labels,
        // Remove the temporary 'id' field before returning
        series: initialSeries.map(({ id, ...rest }) => rest)
    };
};