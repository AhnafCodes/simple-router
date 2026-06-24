/**
 * Index route for /users — shown in the <wc-users> layout's outlet when no
 * specific user is selected.
 */
export default class UserIndex extends HTMLElement {
  connectedCallback() {
    const hint = document.createElement("div");
    hint.textContent = "Select a user to see their details.";
    this.replaceChildren(hint);
  }
}

customElements.define("wc-userindex", UserIndex);
