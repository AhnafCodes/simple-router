import { userList } from "./userlist.js";

/**
 * Layout component for the /users routes. It renders the user list plus a
 * <wc-outlet> where the matched child route (the index placeholder or a
 * selected user's details) mounts — so the list stays put while only the
 * detail pane changes.
 */
export default class Users extends HTMLElement {
  connectedCallback() {
    const page = document.createElement("div");
    page.className = "page";

    const heading = document.createElement("h1");
    heading.textContent = "Users";
    page.appendChild(heading);

    const list = document.createElement("ul");
    // Build links via the DOM so user data is set as text/attributes
    // rather than interpolated into an HTML string (avoids XSS).
    userList.forEach(user => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.setAttribute("route", `/users/${encodeURIComponent(user.id)}`);
      link.textContent = user.name;
      item.appendChild(link);
      list.appendChild(item);
    });
    page.appendChild(list);

    // Nested routes render here.
    page.appendChild(document.createElement("wc-outlet"));

    this.replaceChildren(page);
  }
}

customElements.define("wc-users", Users);
