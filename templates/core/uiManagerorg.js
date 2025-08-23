// --- core/uiManager.js ---

// Ensure Core namespace exists
const Core = window.Core || {};

Core.UIManager = (function() {
    let controlsPanel;
    let activeModuleControls = {}; // Stores UI elements added by modules
    const resizeCallbacks = []; // Callbacks to run on window resize

    function init() {
        controlsPanel = document.getElementById('controls-panel');
        if (!controlsPanel) {
            console.error("UI Manager Error: 'controls-panel' element not found!");
            return;
        }
        console.log("UI Manager initialized.");
    }

    // Registers a new control section for a module
    function registerControls(moduleName, controlsHtml) {
        if (!controlsPanel) return;

        const container = document.createElement('div');
        container.className = 'control-section';
        container.id = `${moduleName}-ui-section`; // Assign an ID for easy access
        container.innerHTML = controlsHtml;
        controlsPanel.appendChild(container);
        activeModuleControls[moduleName] = container;

        // Add a resize callback for this specific module's UI if needed
        resizeCallbacks.push(() => {
            // Logic to adjust UI elements within this module's container based on window size
        });
        console.log(`UI Controls registered for module: ${moduleName}`);
    }

    // Get a specific module's control container
    function getModuleControlContainer(moduleName) {
        return activeModuleControls[moduleName];
    }

    // Update the displayed value of a slider and the slider itself
    function updateSlider(sliderId, value, isInt = false) {
        const slider = document.getElementById(sliderId);
        const span = document.getElementById(sliderId + 'Value');
        if (!slider || !span) return;

        const finalValue = isInt ? Math.round(value) : parseFloat(value);
        slider.value = finalValue;
        const displayValue = isInt ? finalValue : finalValue.toFixed(slider.step < 1 ? 2 : (slider.step < 10 ? 1 : 0));
        span.textContent = `${displayValue}${slider.dataset.unit || ''}`; // Use dataset for unit if set
    }

    // Helper to create a range slider
    function createRangeSlider(id, label, min, max, step, defaultValue, unit = '', dataset = {}) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'control-group';

        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';

        const labelElem = document.createElement('label');
        labelElem.htmlFor = id;
        labelElem.textContent = label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = id;
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = defaultValue;
        slider.dataset.unit = unit; // Store unit in dataset

        const valueSpan = document.createElement('span');
        valueSpan.id = id + 'Value';
        valueSpan.textContent = `${defaultValue}${unit}`;

        // Add event listener for live updating
        slider.addEventListener('input', () => {
            updateSlider(id, slider.value, step < 1);
        });

        sliderContainer.appendChild(labelElem);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueSpan);

        groupDiv.appendChild(sliderContainer);

        // Add dataset attributes to slider for later reference (e.g., unit)
        for (const key in dataset) {
            slider.dataset[key] = dataset[key];
        }

        return { element: groupDiv, slider: slider };
    }

    // Helper to create a button
    function createButton(id, text, onClick, classes = '') {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = text;
        button.className = classes; // Allow passing custom classes
        button.addEventListener('click', onClick);
        return { element: button };
    }

    // Helper to create a toggle button (e.g., for modes)
    function createToggleButton(id, label, onClick, initialActive = false, groupName = '') {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = label;
        button.classList.add('toggle-button');
        button.dataset.active = initialActive; // Store active state
        if (initialActive) button.classList.add('active');

        button.addEventListener('click', () => {
            const isActive = JSON.parse(button.dataset.active);
            button.dataset.active = !isActive;
            button.classList.toggle('active', !isActive);
            if (onClick) onClick(!isActive); // Pass new active state to callback
        });
        return { element: button, activate: () => button.click() }; // Provide a way to activate programmatically
    }

    // Helper to create radio buttons for a group
    function createRadioGroup(groupName, options, selectedValue, onChange) {
        const groupContainer = document.createElement('div');
        groupContainer.className = 'transform-radio-group';
        groupContainer.dataset.groupName = groupName;

        options.forEach(option => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = groupName;
            input.value = option.value;
            input.checked = (option.value === selectedValue);

            input.addEventListener('change', (e) => {
                if (e.target.checked) {
                    onChange(option.value, groupName);
                }
            });

            label.appendChild(input);
            label.appendChild(document.createTextNode(option.label));
            groupContainer.appendChild(label);
        });
        return { element: groupContainer, inputElements: groupContainer.querySelectorAll('input') };
    }

    // Centralized resize handler
    function onResize() {
        resizeCallbacks.forEach(callback => callback());
    }

    return {
        init,
        registerControls,
        getModuleControlContainer,
        updateSlider,
        createRangeSlider,
        createButton,
        createToggleButton,
        createRadioGroup,
        onResize
    };
})();