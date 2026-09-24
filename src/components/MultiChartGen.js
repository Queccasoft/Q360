import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import ChartGen from './ChartGen'; // Make sure the path is correct

const MultiChartGen = forwardRef(({ chartsDataArray }, ref) => {
    const chartRefs = useRef([]);

    

    
    // 3. Expose a central function to generate all images
    useImperativeHandle(ref, () => ({
        generateAllChartImages: () => {
            const images = chartsDataArray.map((chartItem, index) => {
                const chartRef = chartRefs.current[index];
                if (chartRef && chartRef.toBase64Image) {
                    console.log("Base64 img: ",chartRef.toBase64Image())
                    return {
                        title: chartItem.title,
                        base64: chartRef.toBase64Image() // Call the exposed method
                    };
                }
                return null;
            }).filter(img => img !== null);
            return images;
        }
    }));

    // Basic validation
    if (!chartsDataArray || chartsDataArray.length === 0) {
        return <div>No charts data available to display.</div>;
    }

    return (
        // Use a flex container for charts in a row, or grid/Bootstrap row
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3%' }}>
            {chartsDataArray.map((chartItem, index) => (
                // Wrap each chart in a container for styling (e.g., width)
                <div key={index} style={{ width: '30%', flexGrow: 1 ,height: '100%'}}>
                    <h3>{chartItem.title}</h3>
                    {/* 4. Assign dynamic ref to each ChartGen instance */}
                    <ChartGen 
                            ref={el => chartRefs.current[index] = el} 
                            chartData={chartItem} 
                        />
                </div>
            ))}
        </div>
    );
});

export default MultiChartGen;