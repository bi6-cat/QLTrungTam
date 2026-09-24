locals {
  cidr     = { for k, s in var.subnets : k => s.cidr }
  osn      = data.oci_core_services.osn.services[0].cidr_block
  anywhere = "0.0.0.0/0"

  # proto: "6"=TCP, "17"=UDP, "1"=ICMP, "all"
  # peer_type: CIDR_BLOCK | SERVICE_CIDR_BLOCK
  rules = concat(
    # ---------- API endpoint ----------
    [
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [6443, 6443], icmp = null, desc = "workers->api 6443" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = [6443, 6443], icmp = null, desc = "pods->api 6443" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [12250, 12250], icmp = null, desc = "workers->api 12250" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = [12250, 12250], icmp = null, desc = "pods->api 12250" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = var.admin_cidr, peer_type = "CIDR_BLOCK", ports = [6443, 6443], icmp = null, desc = "admin->api" },
      { nsg = "api", dir = "INGRESS", proto = "1", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = [3, 4], desc = "path mtu" },
      { nsg = "api", dir = "EGRESS", proto = "6", peer = local.osn, peer_type = "SERVICE_CIDR_BLOCK", ports = null, icmp = null, desc = "api->oracle services" },
      { nsg = "api", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [10250, 10250], icmp = null, desc = "api->kubelet" },
      { nsg = "api", dir = "EGRESS", proto = "all", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "api->pods (webhooks)" },
      { nsg = "api", dir = "EGRESS", proto = "1", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = [3, 4], desc = "path mtu" },
    ],
    [
      { nsg = "workers", dir = "INGRESS", proto = "all", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "node<->node" },
      { nsg = "workers", dir = "INGRESS", proto = "all", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "pods->node" },
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.cidr.api, peer_type = "CIDR_BLOCK", ports = [10250, 10250], icmp = null, desc = "api->kubelet" },
      { nsg = "workers", dir = "INGRESS", proto = "1", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = [3, 4], desc = "path mtu" },
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.cidr.public, peer_type = "CIDR_BLOCK", ports = [30000, 32767], icmp = null, desc = "nlb health/internal nlb/meta" },
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.cidr.public, peer_type = "CIDR_BLOCK", ports = [10256, 10256], icmp = null, desc = "kube-proxy health" },
      { nsg = "workers", dir = "EGRESS", proto = "all", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "egress" },
    ],
    [for p in var.envoy_node_ports :
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [p, p], icmp = null, desc = "internet->envoy nodeport ${p}" }
    ],
    # ---------- Pods ----------
    [
      { nsg = "pods", dir = "INGRESS", proto = "all", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "node->pod" },
      { nsg = "pods", dir = "INGRESS", proto = "all", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "pod<->pod" },
      { nsg = "pods", dir = "INGRESS", proto = "all", peer = local.cidr.api, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "api->pod" },
      { nsg = "pods", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [10080, 10080], icmp = null, desc = "client->envoy http" },
      { nsg = "pods", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [10443, 10443], icmp = null, desc = "client->envoy https" },
      { nsg = "pods", dir = "EGRESS", proto = "all", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "egress" },
    ],
    # ---------- NLB public ----------
    [
      { nsg = "nlb", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [80, 80], icmp = null, desc = "http" },
      { nsg = "nlb", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [443, 443], icmp = null, desc = "https" },
      { nsg = "nlb", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [30000, 32767], icmp = null, desc = "nlb->nodeports" },
      { nsg = "nlb", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [10256, 10256], icmp = null, desc = "nlb->kube-proxy health" },
    ],
    # ---------- NLB internal (Prometheus/Alertmanager cho meta-monitor) ----------
    [
      { nsg = "nlb_internal", dir = "INGRESS", proto = "6", peer = local.cidr.public, peer_type = "CIDR_BLOCK", ports = [9090, 9093], icmp = null, desc = "meta->prom/am" },
      { nsg = "nlb_internal", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [30000, 32767], icmp = null, desc = "nlb->nodeports" },
    ],
    # ---------- Meta-monitor VM ----------
    [
      { nsg = "meta", dir = "INGRESS", proto = "6", peer = var.admin_cidr, peer_type = "CIDR_BLOCK", ports = [22, 22], icmp = null, desc = "ssh admin" },
      { nsg = "meta", dir = "EGRESS", proto = "all", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "egress" },
    ],
  )
}

resource "oci_core_network_security_group" "this" {
  for_each       = toset(["api", "workers", "pods", "nlb", "nlb_internal", "meta"])
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-nsg-${each.key}"
  freeform_tags  = var.tags
}

resource "oci_core_network_security_group_security_rule" "this" {
  for_each                  = { for r in local.rules : "${r.nsg}|${r.dir}|${r.desc}" => r }
  network_security_group_id = oci_core_network_security_group.this[each.value.nsg].id
  direction                 = each.value.dir
  protocol                  = each.value.proto
  description               = each.value.desc
  stateless                 = false

  source           = each.value.dir == "INGRESS" ? each.value.peer : null
  source_type      = each.value.dir == "INGRESS" ? each.value.peer_type : null
  destination      = each.value.dir == "EGRESS" ? each.value.peer : null
  destination_type = each.value.dir == "EGRESS" ? each.value.peer_type : null

  dynamic "tcp_options" {
    for_each = each.value.proto == "6" && each.value.ports != null ? [each.value.ports] : []
    content {
      destination_port_range {
        min = tcp_options.value[0]
        max = tcp_options.value[1]
      }
    }
  }
  dynamic "icmp_options" {
    for_each = each.value.proto == "1" && each.value.icmp != null ? [each.value.icmp] : []
    content {
      type = icmp_options.value[0]
      code = icmp_options.value[1]
    }
  }
}
