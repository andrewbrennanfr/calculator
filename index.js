const calculationsBody = document.getElementById('calculations-body');
const addButton = document.querySelector('thead .btn-primary');
const addBottomButton = document.getElementById('add-bottom-btn');

addButton.addEventListener('click', addRow);
addBottomButton.addEventListener('click', addRow);

function serializeCalculations() {
  const rows = [];
  calculationsBody.querySelectorAll('tr').forEach(row => {
    const nameInput = row.querySelector('input[placeholder="Name"]');
    const equationInput = row.querySelector('.equation-input');
    const unitSelect = row.querySelector('.unit-select');
    rows.push({
      name: nameInput.value,
      equation: equationInput.value,
      unit: unitSelect ? unitSelect.value : 'number'
    });
  });
  return btoa(JSON.stringify(rows));
}

function deserializeCalculations(hash) {
  try {
    const rows = JSON.parse(atob(hash));
    calculationsBody.innerHTML = '';
    rows.forEach(row => {
      const newRow = document.createElement('tr');
      newRow.innerHTML = `
        <td><input type="text" class="form-control" placeholder="Name" /></td>
        <td><input type="text" class="form-control equation-input" placeholder="Equation" /></td>
        <td class="result-cell"></td>
        <td>
          <select class="form-select form-select-sm unit-select">
            <option value="number">number</option>
            <option value="%">%</option>
            <option value="euro">€</option>
          </select>
        </td>
        <td><button class="btn btn-danger btn-sm delete-btn">Delete</button></td>
      `;
      calculationsBody.appendChild(newRow);

      const nameInput = newRow.querySelector('input[placeholder="Name"]');
      const equationInput = newRow.querySelector('.equation-input');
      const unitSelect = newRow.querySelector('.unit-select');
      const deleteBtn = newRow.querySelector('.delete-btn');

      nameInput.value = row.name;
      equationInput.value = row.equation;
      if (unitSelect && row.unit) unitSelect.value = row.unit;

      let oldName = row.name;
      nameInput.addEventListener('input', function() {
        this.value = this.value.replace(/\s+/g, '');
        const newName = this.value;
        if (oldName && oldName !== newName) {
          renameVariableInEquations(oldName, newName);
        }
        oldName = newName;
        updateAllResults();
        updateHash();
      });
      nameInput.addEventListener('focus', function() {
        highlightReferencesInEquations(this);
      });

      equationInput.addEventListener('input', updateAllResults);
      equationInput.addEventListener('click', function() {
        highlightVariableRows(this);
      });
      equationInput.addEventListener('keyup', function() {
        highlightVariableRows(this);
      });

      unitSelect.addEventListener('change', function() {
        updateAllResults();
        updateHash();
      });

      deleteBtn.addEventListener('click', function() {
        newRow.remove();
        updateAllResults();
        updateHash();
      });
    });
    updateAllResults();
  } catch (e) {
    console.error('Invalid hash data', e);
  }
}

let autocompleteState = { selectedIndex: -1 };

function updateHighlight() {
  const popup = document.getElementById('autocomplete-popup');
  popup.querySelectorAll('.autocomplete-item').forEach((item, i) => {
    item.style.backgroundColor = i === autocompleteState.selectedIndex ? '#f0f0f0' : '';
  });
}

function insertSuggestion(input, value) {
  const text = input.value;
  const start = input.selectionStart;
  let wordStart = start;
  while (wordStart > 0 && /[a-zA-Z0-9_]/.test(text[wordStart - 1])) wordStart--;
  const newText = text.substring(0, wordStart) + value + text.substring(start);
  input.value = newText;
  input.selectionStart = input.selectionEnd = wordStart + value.length;
  document.getElementById('autocomplete-popup').style.display = 'none';
  input.focus();
  updateAllResults();
}

function showAutocompleteSuggestions(input) {
  const word = getWordAtCursor(input);
  const popup = document.getElementById('autocomplete-popup');

  if (!word || !/^[a-zA-Z_]/.test(word)) {
    popup.style.display = 'none';
    return;
  }

  const variables = Object.keys(getVariables());
  const matches = variables.filter(v => v.startsWith(word) && v.length > word.length);

  if (matches.length === 0) {
    popup.style.display = 'none';
    return;
  }

  autocompleteState.selectedIndex = 0;
  autocompleteState.matches = matches;
  autocompleteState.input = input;

  popup.innerHTML = matches.map(match =>
    `<div class="autocomplete-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;" data-value="${match}">${match}</div>`
  ).join('');

  const rect = input.getBoundingClientRect();
  popup.style.display = 'block';
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + 2) + 'px';
  popup.style.width = rect.width + 'px';

  updateHighlight();

  popup.querySelectorAll('.autocomplete-item').forEach((item, index) => {
    item.addEventListener('click', function() {
      insertSuggestion(input, this.dataset.value);
    });
    item.addEventListener('mouseenter', function() {
      autocompleteState.selectedIndex = index;
      updateHighlight();
    });
  });
}

document.addEventListener('keydown', (e) => {
  const popup = document.getElementById('autocomplete-popup');
  if (popup.style.display === 'none' || !autocompleteState.matches) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    autocompleteState.selectedIndex = (autocompleteState.selectedIndex + 1) % autocompleteState.matches.length;
    updateHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    autocompleteState.selectedIndex = autocompleteState.selectedIndex <= 0 ? autocompleteState.matches.length - 1 : autocompleteState.selectedIndex - 1;
    updateHighlight();
  } else if (e.key === 'Enter' && autocompleteState.selectedIndex >= 0) {
    e.preventDefault();
    insertSuggestion(autocompleteState.input, autocompleteState.matches[autocompleteState.selectedIndex]);
  } else if (e.key === 'Escape') {
    popup.style.display = 'none';
  }
});

function updateHash() {
  window.location.hash = serializeCalculations();
}

if (window.location.hash) {
  deserializeCalculations(window.location.hash.substring(1));
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.equation-input') && !e.target.closest('#autocomplete-popup')) {
    document.getElementById('autocomplete-popup').style.display = 'none';
  }
});

function getVariables() {
  const vars = {};
  calculationsBody.querySelectorAll('tr').forEach(row => {
    const nameInput = row.querySelector('input[placeholder="Name"]');
    const resultCell = row.querySelector('.result-cell');
    if (nameInput && nameInput.value && resultCell.dataset.rawValue) {
      const numValue = parseFloat(resultCell.dataset.rawValue);
      if (!isNaN(numValue)) {
        vars[nameInput.value] = numValue;
      }
    }
  });
  return vars;
}

function safeEvaluate(expr, variables = {}) {
  try {
    const tokens = expr.match(/[a-zA-Z_]\w*|\d+\.?\d*%?|[+\-*/()]/g);
    if (!tokens) return '';
    return evaluateTokens(tokens, variables);
  } catch {
    return '';
  }
}

function evaluateTokens(tokens, variables) {
  let pos = 0;

  function parseExpression() {
    let result = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm() {
    let result = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = parseFactor();
      result = op === '*' ? result * right : result / right;
    }
    return result;
  }

  function parseFactor() {
    if (tokens[pos] === '(') {
      pos++;
      const result = parseExpression();
      pos++;
      return result;
    }
    const token = tokens[pos++];
    if (token.endsWith('%')) {
      return parseFloat(token) / 100;
    }
    const numVal = parseFloat(token);
    return isNaN(numVal) ? (variables[token] || 0) : numVal;
  }

  const result = parseExpression();
  return isNaN(result) ? '' : result;
}

function extractVariables(expr) {
  const matches = expr.match(/[a-zA-Z_]\w*/g) || [];
  return [...new Set(matches)];
}

function getWordAtCursor(input) {
  const text = input.value;
  const cursorPos = input.selectionStart;

  let start = cursorPos;
  let end = cursorPos;

  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;

  return text.substring(start, end);
}

function highlightVariableRows(equationInput) {
  calculationsBody.querySelectorAll('tr').forEach(row => {
    row.classList.remove('highlight');
  });

  const word = getWordAtCursor(equationInput);

  if (word && /^[a-zA-Z_]/.test(word)) {
    calculationsBody.querySelectorAll('tr').forEach(row => {
      const nameInput = row.querySelector('input[placeholder="Name"]');
      if (nameInput && nameInput.value === word) {
        row.classList.add('highlight');
      }
    });
  }
}

function formatResultWithUnit(value, unit) {
  if (!value) return '';
  if (unit === 'euro') return '€' + value;
  if (unit === '%') return value + '%';
  return value;
}

function updateAllResults() {
  const variables = getVariables();
  calculationsBody.querySelectorAll('.equation-input').forEach(input => {
    const row = input.closest('tr');
    const resultCell = row.querySelector('.result-cell');
    const unitSelect = row.querySelector('.unit-select');
    const unit = unitSelect ? unitSelect.value : 'number';
    const rawResult = safeEvaluate(input.value, variables);
    resultCell.dataset.rawValue = rawResult;
    resultCell.textContent = formatResultWithUnit(rawResult, unit);
  });
  updateVariableSuggestions();
}

function highlightReferencesInEquations(nameInput) {
  calculationsBody.querySelectorAll('tr').forEach(row => {
    row.classList.remove('highlight');
  });

  const varName = nameInput.value;
  if (!varName) return;

  calculationsBody.querySelectorAll('.equation-input').forEach(equationInput => {
    if (extractVariables(equationInput.value).includes(varName)) {
      equationInput.closest('tr').classList.add('highlight');
    }
  });
}

function renameVariableInEquations(oldName, newName) {
  calculationsBody.querySelectorAll('.equation-input').forEach(input => {
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    input.value = input.value.replace(regex, newName);
  });
  updateAllResults();
}

function insertSuggestion(input, value) {
  const text = input.value;
  const start = input.selectionStart;
  let wordStart = start;
  while (wordStart > 0 && /[a-zA-Z0-9_]/.test(text[wordStart - 1])) wordStart--;
  const newText = text.substring(0, wordStart) + value + text.substring(start);
  input.value = newText;
  input.selectionStart = input.selectionEnd = wordStart + value.length;
  document.getElementById('autocomplete-popup').style.display = 'none';
  input.focus();
  updateAllResults();
}

function updateVariableSuggestions() {}

function addRow() {
  const newRow = document.createElement('tr');
  newRow.innerHTML = `
    <td><input type="text" class="form-control" placeholder="Name" /></td>
    <td><input type="text" class="form-control equation-input" placeholder="Equation" /></td>
    <td class="result-cell"></td>
    <td>
      <select class="form-select form-select-sm unit-select">
        <option value="number">number</option>
        <option value="%">%</option>
        <option value="euro">€</option>
      </select>
    </td>
    <td><button class="btn btn-danger btn-sm delete-btn">Delete</button></td>
  `;

  calculationsBody.appendChild(newRow);
  updateHash();

  const nameInput = newRow.querySelector('input[placeholder="Name"]');
  nameInput.focus();
  const equationInput = newRow.querySelector('.equation-input');
  const unitSelect = newRow.querySelector('.unit-select');
  const deleteBtn = newRow.querySelector('.delete-btn');

  let oldName = '';
  nameInput.addEventListener('input', function() {
    this.value = this.value.replace(/\s+/g, '');
    const newName = this.value;
    if (oldName && oldName !== newName) {
      renameVariableInEquations(oldName, newName);
    }
    oldName = newName;
    updateAllResults();
    updateHash();
  });
  nameInput.addEventListener('focus', function() {
    highlightReferencesInEquations(this);
  });
  equationInput.addEventListener('input', function() {
    updateAllResults();
    updateHash();
    showAutocompleteSuggestions(this);
  });
  unitSelect.addEventListener('change', function() {
    updateAllResults();
    updateHash();
  });
  equationInput.addEventListener('click', function() {
    highlightVariableRows(this);
    showAutocompleteSuggestions(this);
  });
  equationInput.addEventListener('keyup', function(e) {
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
      highlightVariableRows(this);
      showAutocompleteSuggestions(this);
    }
  });
  nameInput.addEventListener('blur', function() {
    calculationsBody.querySelectorAll('tr').forEach(row => {
      row.classList.remove('highlight');
    });
  });
  equationInput.addEventListener('blur', function() {
    calculationsBody.querySelectorAll('tr').forEach(row => {
      row.classList.remove('highlight');
    });
  });
  deleteBtn.addEventListener('click', function() {
    newRow.remove();
    updateAllResults();
    updateHash();
  });
}

document.querySelectorAll('.delete-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    this.closest('tr').remove();
    updateAllResults();
    updateHash();
  });
});

document.querySelectorAll('input[placeholder="Name"]').forEach(input => {
  let oldName = '';
  input.addEventListener('input', function() {
    this.value = this.value.replace(/\s+/g, '');
    const newName = this.value;
    if (oldName && oldName !== newName) {
      renameVariableInEquations(oldName, newName);
    }
    oldName = newName;
    updateAllResults();
    updateHash();
  });
  input.addEventListener('focus', function() {
    highlightReferencesInEquations(this);
  });
  input.addEventListener('blur', function() {
    calculationsBody.querySelectorAll('tr').forEach(row => {
      row.classList.remove('highlight');
    });
  });
});

document.querySelectorAll('.equation-input').forEach(input => {
  input.addEventListener('input', function() {
    updateAllResults();
    updateHash();
    showAutocompleteSuggestions(this);
  });
  input.addEventListener('click', function() {
    highlightVariableRows(this);
    showAutocompleteSuggestions(this);
  });
  input.addEventListener('keyup', function(e) {
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
      highlightVariableRows(this);
      showAutocompleteSuggestions(this);
    }
  });
  input.addEventListener('blur', function() {
    calculationsBody.querySelectorAll('tr').forEach(row => {
      row.classList.remove('highlight');
    });
  });
});

document.querySelectorAll('.unit-select').forEach(select => {
  select.addEventListener('change', function() {
    updateAllResults();
    updateHash();
  });
});
