// --- core/uiManager.js ---
Core.UIManager = (function() {
    let controlsPanel, toggleTab;

    function init() {
        controlsPanel = document.getElementById('controls-panel');
        toggleTab = document.getElementById('panel-toggle-tab');
        if (toggleTab) {
            toggleTab.addEventListener('click', () => {
                controlsPanel.classList.toggle('collapsed');
            });
        }
    }

    function registerControls(moduleName, controlsHtml) {
        const container = document.createElement('div');
        container.innerHTML = controlsHtml;
        controlsPanel.appendChild(container);
    }

    function createRangeSlider(id, label, min, max, step, value) {
        return `<div class="slider-container"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><span>${value}</span></div>`;
    }

    function createButton(id, text) {
        return `<button id="${id}">${text}</button>`;
    }

    function createRadioGroup(groupName, options, selected) {
        let html = '<div class="transform-radio-group">';
        options.forEach(opt => {
            html += `<label><input type="radio" name="${groupName}" value="${opt.value}" ${opt.value === selected ? 'checked' : ''}>${opt.label}</label>`;
        });
        html += '</div>';
        return html;
    }

    return { init, registerControls, createRangeSlider, createButton, createRadioGroup };
})();