/* PALETA OFICIAL BRASIL PONTES */
:root {
  --bp-blue: #003399;
  --bp-light: #00CFFF;
  --bp-dark: #002266;
  --bp-bg: #F4F6F9;
}

body {
  background-color: var(--bp-bg);
}

/* Customização de Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
}
::-webkit-scrollbar-thumb {
  background: var(--bp-blue);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--bp-dark);
}
