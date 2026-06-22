import { userList } from "./userlist.js";

export default class UserDetails extends HTMLElement {
  static get observedAttributes() {
    return ["id"];
  }

  connectedCallback() {
    const id = this.getAttribute("id");
    if (!id) return;

    const user = userList.find(e => e.id === parseInt(id, 10));

    const page = document.createElement("div");
    page.className = "page";

    const heading = document.createElement("h1");
    heading.textContent = "User Details";
    page.appendChild(heading);

    const detail = document.createElement("div");
    // textContent, not innerHTML, so the name is never parsed as markup.
    detail.textContent = user ? user.name : "User not found";
    page.appendChild(detail);

    this.replaceChildren(page);
  }
}

customElements.define("wc-userdetails", UserDetails);
