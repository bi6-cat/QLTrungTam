output "control_plane_self_links" {
  value = [for k, n in google_compute_instance.node : n.self_link if var.nodes[k].role == "control-plane"]
}

