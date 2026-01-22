/*
 * Modal
 *
 * Pico.css - https://picocss.com
 * Copyright 2019-2024 - Licensed under MIT
 */

// Config
const isOpenClass = "modal-is-open";
const openingClass = "modal-is-opening";
const closingClass = "modal-is-closing";
const scrollbarWidthCssVar = "--pico-scrollbar-width";
const animationDuration = 400; // ms
let visibleModal = null;

// Toggle modal
const toggleModal = (event) => {
  event.preventDefault();
  const modal = document.getElementById(event.currentTarget.dataset.target);
  if (!modal) return;
  modal && (modal.open ? closeModal(modal) : openModal(modal));
};

// Open modal
const openModal = (modal) => {
  const { documentElement: html } = document;
  const scrollbarWidth = getScrollbarWidth();
  if (scrollbarWidth) {
    html.style.setProperty(scrollbarWidthCssVar, `${scrollbarWidth}px`);
  }
  html.classList.add(isOpenClass, openingClass);
  setTimeout(() => {
    visibleModal = modal;
    html.classList.remove(openingClass);
  }, animationDuration);
  modal.showModal();
};

// Close modal
const closeModal = (modal) => {
  visibleModal = null;
  const { documentElement: html } = document;
  html.classList.add(closingClass);
  setTimeout(() => {
    html.classList.remove(closingClass, isOpenClass);
    html.style.removeProperty(scrollbarWidthCssVar);
    modal.close();
  }, animationDuration);
};

// Get scrollbar width
const getScrollbarWidth = () => {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  return scrollbarWidth;
};

// Is scrollbar visible
const isScrollbarVisible = () => {
  return document.body.scrollHeight > screen.height;
};

document.querySelectorAll("[data-target]").forEach((btn) => {
  btn.addEventListener("click", toggleModal);
});
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (visibleModal) closeModal(visibleModal);
  });
});

async function openRowEditor({
  windowEl,
  table,
  rowIndex = null,
  pk = 'id'
}) {
  const modal = document.getElementById('new-row-modal');
  const form = modal.querySelector('[data-row-form]');
  const fields = modal.querySelector('[data-row-fields]');

  const siteUUID = windowEl.dataset.siteUuid;
  const dbPath = windowEl.dataset.path;

  // fill hidden context
  form.path.value = dbPath;
  form.table.value = table;
  form.pk.value = pk;
  form.rowId.value = rowIndex ?? '';

  form.setAttribute(
    'hx-post',
    `/sites/${siteUUID}/database/row/save`
  );

  // load schema
  const schema = await fetch(
    `/sites/${siteUUID}/database/table/schema`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ path: dbPath, table })
    }
  ).then(r => r.json());

  // load row values if editing
  const row =
    rowIndex != null
      ? await fetch(`/sites/${siteUUID}/database/row`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            path: dbPath,
            table,
            rowIndex
          })
        }).then(r => r.json()).then(r => r.row)
      : {};

  // render inputs
  fields.innerHTML = schema.columns
    .filter(c => !c.pk)
    .map(c => `
      <label>
        ${c.name}
        <input
          name="values[${c.name}]"
          value="${row?.[c.name] ?? ''}"
        />
      </label>
    `)
    .join('');

  modal.showModal();
}

